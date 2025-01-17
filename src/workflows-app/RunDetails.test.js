import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import _ from 'lodash/fp';
import { h } from 'react-hyperscript-helpers';
import { isAzureUri } from 'src/data/data-table/uri-viewer/uri-viewer-utils';
import { Ajax } from 'src/libs/ajax';
import * as configStore from 'src/libs/config';
import { makeCompleteDate } from 'src/libs/utils';
import { SelectHelper } from 'src/testing/test-utils';
import { appendSASTokenIfNecessary, getFilenameFromAzureBlobPath } from 'src/workflows-app/components/InputOutputModal';
import { collapseCromwellStatus } from 'src/workflows-app/components/job-common';
import { failedTasks as failedTasksMetadata } from 'src/workflows-app/fixtures/failed-tasks';
import { metadata as childMetadata } from 'src/workflows-app/fixtures/test-child-workflow';
import { metadata as parentMetadata } from 'src/workflows-app/fixtures/test-parent-workflow';
import { metadata as runDetailsMetadata } from 'src/workflows-app/fixtures/test-workflow';
import { BaseRunDetails } from 'src/workflows-app/RunDetails';
import { mockAzureWorkspace } from 'src/workflows-app/utils/mock-responses';

jest.mock('src/libs/ajax');

jest.mock('src/components/Modal', () => {
  const mockModal = jest.requireActual('src/components/Modal.mock');
  return mockModal.mockModalModule();
});

const wdsUrlRoot = 'https://lz-abc/wds-abc-c07807929cd1/';
const cbasUrlRoot = 'https://lz-abc/terra-app-abc/cbas';
const cromwellUrlRoot = 'https://lz-abc/terra-app-abc/cromwell';

jest.mock('src/libs/config', () => ({
  ...jest.requireActual('src/libs/config'),
  getConfig: jest.fn().mockReturnValue({ cromwellUrlRoot, cbasUrlRoot, wdsUrlRoot }),
}));

jest.mock('src/libs/nav', () => ({
  getCurrentUrl: jest.fn().mockReturnValue(new URL('https://app.terra.bio')),
  getLink: jest.fn(),
  goToPath: jest.fn(),
}));

const runDetailsProps = {
  namespace: 'example-billing-project',
  name: 'workspace',
  workspace: mockAzureWorkspace,
  submissionId: '000sdkfjsdfj-dfdsfdsf3-sdfsdjfkj3',
  workflowId: '00001111-2222-3333-aaaa-bbbbccccdddd',
  uri: 'https://coaexternalstorage.blob.core.windows.net/cromwell/user-inputs/inputFile.txt',
};

const mockObj = {
  CromwellApp: {
    workflows: () => {
      return {
        metadata: jest.fn(() => {
          return Promise.resolve(runDetailsMetadata);
        }),
        failedTasks: jest.fn(() => {
          return Promise.resolve(failedTasksMetadata);
        }),
      };
    },
  },
  AzureStorage: {
    blobMetadata: jest.fn(() => ({
      getData: () =>
        Promise.resolve({
          uri: 'https://someBlobFilePath.blob.core.windows.net/cromwell/user-inputs/inputFile.txt',
          sasToken: '1234-this-is-a-mock-sas-token-5678',
          fileName: 'inputFile.txt',
          name: 'inputFile.txt',
          lastModified: 'Mon, 22 May 2023 17:12:58 GMT',
          size: '324',
          contentType: 'text/plain',
          textContent: 'this is the text of a mock file',
          azureSasStorageUrl: 'https://someBlobFilePath.blob.core.windows.net/cromwell/user-inputs/inputFile.txt',
        }),
    })),
    details: jest.fn(() => {
      return Promise.resolve({ sas: { token: '1234-this-is-a-mock-sas-token-5678' } });
    }),
  },
};

const subworkflowCromwellAjaxMock = (parentOverride = {}) => {
  const modifiedParentMetadata = { ...parentMetadata, ...parentOverride };
  return {
    CromwellApp: {
      workflows: (id) => {
        return {
          metadata: jest.fn(() => {
            const workflowMap = {
              [parentMetadata.id]: modifiedParentMetadata,
              [childMetadata.id]: childMetadata,
            };
            return Promise.resolve(workflowMap[id]);
          }),
          failedTasks: jest.fn(() => {
            return Promise.resolve({});
          }),
        };
      },
    },
  };
};

beforeEach(() => {
  Ajax.mockImplementation(() => {
    return mockObj;
  });
});

describe('BaseRunDetails - render smoke test', () => {
  const originalOffsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight');
  const originalOffsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth');

  beforeAll(() => {
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, value: 1000 });
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, value: 800 });
  });

  afterAll(() => {
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', originalOffsetHeight);
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', originalOffsetWidth);
  });

  it('shows the workflow status', async () => {
    const { container } = await act(async () => render(h(BaseRunDetails, runDetailsProps)));
    expect(await axe(container)).toHaveNoViolations();
    const statusContainer = screen.getByLabelText('Workflow Status Container');
    within(statusContainer).getByText(runDetailsMetadata.status);
  });

  it('shows the workflow timing', async () => {
    await act(async () => render(h(BaseRunDetails, runDetailsProps)));

    const startTime = screen.getByLabelText('Workflow Start Container');
    const endTime = screen.getByLabelText('Workflow End Container');
    const formattedStart = makeCompleteDate(runDetailsMetadata.start);
    const formattedEnd = makeCompleteDate(runDetailsMetadata.end);
    expect(startTime.textContent).toContain(formattedStart);
    expect(endTime.textContent).toContain(formattedEnd);
  });

  it('shows the troubleshooting box', async () => {
    await act(async () => render(h(BaseRunDetails, runDetailsProps)));
    screen.getByText('Troubleshooting?');
    screen.getByText(runDetailsProps.workflowId);
    screen.getByText(runDetailsProps.submissionId);
    screen.getByText('Execution Log');
  });

  it('has copy buttons', async () => {
    await act(async () => render(h(BaseRunDetails, runDetailsProps)));
    screen.getByLabelText('Copy workflow id');
    screen.getByLabelText('Copy submission id');
    screen.getByText(runDetailsProps.workflowId);
    screen.getByText(runDetailsProps.submissionId);
  });

  it('shows the wdl text in a modal component', async () => {
    const user = userEvent.setup();
    await act(async () => render(h(BaseRunDetails, runDetailsProps)));
    const viewModalLink = screen.getByText('View Workflow Script');
    await user.click(viewModalLink);
    screen.getByText(/Retrieve reads from the/);
  });

  it('shows the calls in a table', async () => {
    const { calls } = runDetailsMetadata;

    const calcRowCount = () => {
      const callNames = Object.keys(calls);
      return callNames.reduce((rows, callName) => {
        rows += calls[callName]?.length || 0;
        return rows;
      }, 1);
    };

    await act(async () => render(h(BaseRunDetails, runDetailsProps)));

    const table = screen.getByRole('table');
    const rows = within(table).getAllByRole('row');
    expect(rows.length).toEqual(calcRowCount());
    const taskRows = rows.slice(1);
    const taskNames = Object.keys(calls);
    taskNames.forEach((taskName, index) => {
      const { executionStatus, backendStatus, start, end } = calls[taskName][0];
      const row = taskRows[index];
      within(row).getByText(taskName);
      within(row).getByText('Logs');
      // Checking row text content for dates since querying by formatted date doesn't seem to work
      const statusObj = collapseCromwellStatus(executionStatus, backendStatus);
      const status = within(row).getAllByText(statusObj.label());
      expect(status.length).toEqual(2);
      const targetStartText = makeCompleteDate(start);
      const targetEndText = makeCompleteDate(end);
      expect(row.textContent).toContain(targetStartText);
      expect(row.textContent).toContain(targetEndText);
    });
  });

  it('only shows failed tasks if a workflow has failed', async () => {
    const failedTaskCalls = Object.values(failedTasksMetadata)[0].calls;
    const targetCall = Object.values(failedTaskCalls)[0][0];
    const { start, end } = targetCall;
    const workflowCopy = _.cloneDeep(runDetailsMetadata);
    workflowCopy.status = 'Failed';

    const modifiedMock = {
      ..._.cloneDeep(mockObj),
      CromwellApp: {
        workflows: () => {
          return {
            metadata: () => {
              return workflowCopy;
            },
            failedTasks: () => {
              return failedTasksMetadata;
            },
          };
        },
      },
    };

    // redefine Ajax mock so that it returns the modified workflow instead of the original
    Ajax.mockImplementation(() => {
      return modifiedMock;
    });

    const user = userEvent.setup();

    await act(async () => render(h(BaseRunDetails, runDetailsProps)));
    const statusFilter = screen.getByLabelText('Status');
    const select = new SelectHelper(statusFilter, user);
    expect(select.getSelectedOptions()).toEqual(['Failed']);
    const table = screen.getByRole('table');
    const rows = within(table).getAllByRole('row');
    expect(rows.length).toEqual(6);
    const targetRow = within(table).getAllByRole('row')[1];
    within(targetRow).getByText('sub_wf_scattering.subSubworkflowHello');
    const failedStatus = within(targetRow).getAllByText('Failed');
    expect(failedStatus.length).toEqual(2);
    const targetStartText = makeCompleteDate(start);
    const targetEndText = makeCompleteDate(end);
    expect(targetRow.textContent).toContain(targetStartText);
    expect(targetRow.textContent).toContain(targetEndText);
    within(targetRow).getByText('Logs');
  });

  it('opens the log viewer modal when Execution Logs is clicked', async () => {
    const user = userEvent.setup();
    await act(async () => render(h(BaseRunDetails, runDetailsProps)));
    const executionLogButton = screen.getByText('Execution Log');
    await user.click(executionLogButton);
    screen.getByText('workflow.log');
    screen.getByText('this is the text of a mock file');
  });

  it('opens the log viewer modal when Logs is clicked', async () => {
    const user = userEvent.setup();
    await act(async () => render(h(BaseRunDetails, runDetailsProps)));
    const table = screen.getByRole('table');
    const logsLink = within(table).getAllByText('Logs');
    await user.click(logsLink[0]);
    screen.getByText('Task Standard Out');
  });

  it('shows a static error message on LogViewer if log cannot be retrieved', async () => {
    const altMockObj = _.cloneDeep(mockObj);
    altMockObj.AzureStorage.blobMetadata = jest.fn(() => ({ getData: () => Promise.reject('Mock error') }));
    Ajax.mockImplementation(() => altMockObj);
    const user = userEvent.setup();
    await act(async () => render(h(BaseRunDetails, runDetailsProps)));
    const table = screen.getByRole('table');
    const logsLink = within(table).getAllByText('Logs');
    await user.click(logsLink[0]);
    expect(screen.queryByLabelText('Download log')).not.toBeDefined;
    screen.getByText('Task Standard Out');
    screen.getByText(
      "Log file could not be loaded. If the workflow or task is still in progress, the log file likely hasn't been generated yet. Some logs may be unavailable if the workflow or task failed before they could be generated."
    );
  });

  it('opens a log modal with functional tabs', async () => {
    const altMockObj = _.cloneDeep(mockObj);
    altMockObj.AzureStorage.blobMetadata = jest.fn(() => ({ getData: () => Promise.reject('Mock error') }));
    Ajax.mockImplementation(() => altMockObj);
    const user = userEvent.setup();
    await act(async () => render(h(BaseRunDetails, runDetailsProps)));
    const table = screen.getByRole('table');
    const logsLink = within(table).getAllByText('Logs');
    await user.click(logsLink[0]);

    // We know we've successfully switchted tabs if:
    // We click on a tab title, see a corresponding filename, and don't see other filenames.
    const stdoutButton = screen.getByText('Task Standard Out');
    await user.click(stdoutButton);
    expect(screen.getByText('stdout.txt')).toBeVisible();
    expect(screen.queryByText('stderr.txt')).not.toBeInTheDocument();

    const stderrButton = screen.getByText('Task Standard Err');
    await user.click(stderrButton);
    expect(screen.getByText('stderr.txt')).toBeVisible();
    expect(screen.queryByText('stdout.txt')).not.toBeInTheDocument();

    const backendStdoutButton = screen.getByText('Backend Standard Out');
    await user.click(backendStdoutButton);
    expect(screen.getByText('stdout.txt')).toBeVisible();
    expect(screen.queryByText('stderr.txt')).not.toBeInTheDocument();

    const backendStderrButton = screen.getByText('Backend Standard Err');
    await user.click(backendStderrButton);
    expect(screen.getByText('stderr.txt')).toBeVisible();
    expect(screen.queryByText('stdout.txt')).not.toBeInTheDocument();
  });

  it('correctly identifies azure URIs', () => {
    expect(isAzureUri('https://coaexternalstorage.blob.core.windows.net/cromwell/user-inputs/inputFile.txt')).toBeTruthy;
    expect(isAzureUri('gs://some-bucket/some-file.txt')).toBeFalsy;
  });

  it('shows a functional log modal when clicked', async () => {
    const user = userEvent.setup();
    await act(async () => render(h(BaseRunDetails, runDetailsProps)));
    const showLogsLink = screen.getByText('Logs');
    await user.click(showLogsLink); // Open the modal

    // Verify all the element titles are present
    screen.getByText('Task Standard Out');
    screen.getByText('Task Standard Err');
    screen.getByText('Backend Standard Out');
    screen.getByText('Backend Standard Err');
    screen.getByLabelText('Download log');
    // Verify the data loaded properly
    screen.getByText('this is the text of a mock file');
  });

  it('shows download button AND error when URI is valid but text could not be parsed', async () => {
    const altMockObj = _.cloneDeep(mockObj);
    altMockObj.AzureStorage.blobMetadata = jest.fn(() => ({
      getData: () =>
        Promise.resolve({
          textContent: undefined,
          azureSasStorageUrl: 'https://someBlobFilePath.blob.core.windows.net/cromwell/user-inputs/inputFile.txt',
        }),
    }));
    Ajax.mockImplementation(() => altMockObj);
    const user = userEvent.setup();
    await act(async () => render(h(BaseRunDetails, runDetailsProps)));
    const showLogsLink = screen.getByText('Logs');
    await user.click(showLogsLink); // Open the modal

    // Verify all the element titles are present
    screen.getByText('Task Standard Out');
    screen.getByText('Task Standard Err');
    screen.getByText('Backend Standard Out');
    screen.getByText('Backend Standard Err');

    // Verify the error is displayed.
    screen.getByText(
      "Log file could not be loaded. If the workflow or task is still in progress, the log file likely hasn't been generated yet. Some logs may be unavailable if the workflow or task failed before they could be generated."
    );
  });

  it('filters out task list via task name search', async () => {
    const taskName = Object.keys(runDetailsMetadata.calls)[0];
    await act(async () => render(h(BaseRunDetails, runDetailsProps)));
    const searchInput = screen.getByPlaceholderText('Search by task name');
    await userEvent.type(searchInput, 'Random');
    const updatedTable = screen.getByRole('table');
    const updatedRows = within(updatedTable).getAllByRole('row');
    expect(updatedRows.length).toEqual(1);
    const updatedElements = within(updatedTable).queryAllByText(taskName);
    expect(updatedElements.length).toEqual(0);
  });

  it('filters in tasks via task name search', async () => {
    const taskName = Object.keys(runDetailsMetadata.calls)[0];
    await act(async () => render(h(BaseRunDetails, runDetailsProps)));
    const searchInput = screen.getByPlaceholderText('Search by task name');
    await userEvent.type(searchInput, 'Fetch');
    const updatedTable = screen.getByRole('table');
    const updatedRows = within(updatedTable).getAllByRole('row');
    expect(updatedRows.length).toEqual(2);
    const updatedElement = within(updatedTable).getAllByText(taskName);
    expect(updatedElement.length).toEqual(1);
    expect(updatedElement[0].textContent).toEqual(taskName);
  });

  it('opens the input/output modal when Inputs is clicked', async () => {
    const user = userEvent.setup();
    await act(async () => render(h(BaseRunDetails, runDetailsProps)));
    const table = screen.getByRole('table');
    const inputs = within(table).getAllByLabelText('View task inputs');
    await user.click(inputs[0]);
    screen.getByText('Key');
    screen.getByText('Value');
    screen.getByText('docker');
    screen.getByText('quay.io/broadinstitute/ncbi-tools:2.10.7.10');
  });

  it('opens the input/output modal when Outputs is clicked', async () => {
    const user = userEvent.setup();
    await act(async () => render(h(BaseRunDetails, runDetailsProps)));
    const table = screen.getByRole('table');
    const outputs = within(table).getAllByLabelText('View task outputs');
    await user.click(outputs[0]);
    // There is no output data in this test case, but the modal still open.
    screen.getByText('Key');
    screen.getByText('Value');
  });

  it('input/output modal file functions work as expected', () => {
    const mockWorkspaceId = 'd4564046-bbba-495c-afec-14f7d3a8283a';
    jest.spyOn(configStore, 'getConfig').mockReturnValue({ workspaceId: mockWorkspaceId });
    const publicURI = 'https://lze033433beed5b4a6a47de6.blob.core.windows.net/sc-e3ac5af2-dc4f-42cc-9111-a6f37acfe21a/ref-sarscov2-NC_045512.2.fasta';
    const privateURI =
      'https://lz43a8a3d21540dfd25f5ace.blob.core.windows.net/sc-d4564046-bbba-495c-afec-14f7d3a8283a/workspace-services/cbas/terra-app-566e92a0-e55e-4250-b4c1-d0925dd03916/assemble_refbased/43d15a0d-848b-46e3-a1da-02b37caaa761/call-align_to_ref/shard-0/execution/stdout';
    const mockSAS = 'mockSAS';

    expect(privateURI.includes(mockWorkspaceId)).toBeTruthy; // sanity check that the test is set up properly

    // Should be the last thing after the slash
    const publicFilename = getFilenameFromAzureBlobPath(publicURI);
    const privateFilename = getFilenameFromAzureBlobPath(privateURI);
    expect(publicFilename).toEqual('ref-sarscov2-NC_045512.2.fasta');
    expect(privateFilename).toEqual('stdout');
    expect(getFilenameFromAzureBlobPath('')).toEqual('');
    expect(getFilenameFromAzureBlobPath(undefined)).toEqual('');

    // Should only append SAS if it is a private URI
    const appendedPublic = appendSASTokenIfNecessary(publicURI, mockSAS);
    const appendedPrivate = appendSASTokenIfNecessary(privateURI, mockSAS);
    expect(appendedPublic).toEqual(publicURI);
    expect(appendedPrivate).toEqual(`${privateURI}?${mockSAS}`);
  });

  it('renders the workflow path above the table for successful workflows', async () => {
    await act(async () => render(h(BaseRunDetails, runDetailsProps)));
    const workflowPath = screen.getByLabelText('Workflow Breadcrumb');
    within(workflowPath).getByText(runDetailsMetadata.workflowName);
  });

  it('shows the "View sub-workflow" button for sub-workflows', async () => {
    const altMockObj = _.cloneDeep(mockObj);
    const altBaseRunDetailsProps = { ...runDetailsProps, workflowId: parentMetadata.id };
    Ajax.mockImplementation(() => ({ ...altMockObj, ...subworkflowCromwellAjaxMock({ status: 'Succeeded' }) }));
    await act(async () => render(h(BaseRunDetails, altBaseRunDetailsProps)));
    const table = screen.getByRole('table');
    within(table).getByText('View sub-workflow');
  });

  it('updates the workflow path when the "View sub-workflow" button is clicked', async () => {
    const altMockObj = _.cloneDeep(mockObj);
    const altBaseRunDetailsProps = { ...runDetailsProps, workflowId: parentMetadata.id };
    Ajax.mockImplementation(() => ({ ...altMockObj, ...subworkflowCromwellAjaxMock({ status: 'Succeeded' }) }));
    const user = userEvent.setup();
    await act(async () => render(h(BaseRunDetails, altBaseRunDetailsProps)));
    const table = screen.getByRole('table');
    const subworkflowButton = within(table).getByText('View sub-workflow');
    await user.click(subworkflowButton);
    const workflowPath = screen.getByLabelText('Workflow Breadcrumb');
    within(workflowPath).getByText(childMetadata.workflowName);
  });

  it('updates the table to show the sub-workflow calls when the "View sub-workflow" button is clicked', async () => {
    const altMockObj = _.cloneDeep(mockObj);
    const altBaseRunDetailsProps = { ...runDetailsProps, workflowId: parentMetadata.id };
    Ajax.mockImplementation(() => ({ ...altMockObj, ...subworkflowCromwellAjaxMock({ status: 'Succeeded' }) }));
    const user = userEvent.setup();
    await act(async () => render(h(BaseRunDetails, altBaseRunDetailsProps)));
    const table = screen.getByRole('table');
    const subworkflowButton = within(table).getByText('View sub-workflow');
    await user.click(subworkflowButton);
    const updatedTable = screen.getByRole('table');
    const subWorkflowTaskNames = Object.keys(childMetadata.calls);
    subWorkflowTaskNames.forEach((taskName) => {
      within(updatedTable).getAllByText(taskName);
    });
  });

  it('updates the workflow path and the table if the user clicks on a workflow id within the workflow path', async () => {
    const altMockObj = _.cloneDeep(mockObj);
    const altBaseRunDetailsProps = { ...runDetailsProps, workflowId: parentMetadata.id };
    Ajax.mockImplementation(() => ({ ...altMockObj, ...subworkflowCromwellAjaxMock({ status: 'Succeeded' }) }));
    const user = userEvent.setup();
    await act(async () => render(h(BaseRunDetails, altBaseRunDetailsProps)));
    const table = screen.getByRole('table');
    const subworkflowButton = within(table).getByText('View sub-workflow');
    await user.click(subworkflowButton);
    const workflowPath = screen.getByLabelText('Workflow Breadcrumb');
    const targetIdPath = within(workflowPath).getByText(parentMetadata.workflowName);
    await user.click(targetIdPath);
    const updatedTable = screen.getByRole('table');
    const updatedPath = screen.getByLabelText('Workflow Breadcrumb');
    within(updatedPath).getByText(parentMetadata.workflowName);
    expect(screen.queryByText(childMetadata.workflowName)).not.toBeInTheDocument;
    const parentTaskNames = Object.keys(parentMetadata.calls);
    parentTaskNames.forEach((taskName) => {
      within(updatedTable).getByText(taskName);
    });
  });

  it('loads the page even if the failed tasks endpoint returns an error', async () => {
    const workflowCopy = _.cloneDeep(runDetailsMetadata);
    const failedTaskName = 'fetch_sra_to_bam.Fetch_SRA_to_BAM';
    const failedCall = workflowCopy.calls[failedTaskName][0];
    const { start, end } = failedCall;
    failedCall.backendStatus = 'Failed';
    failedCall.executionStatus = 'Failed';
    workflowCopy.status = 'Failed';

    const modifiedMock = {
      ..._.cloneDeep(mockObj),
      CromwellApp: {
        workflows: () => {
          return {
            metadata: () => {
              return workflowCopy;
            },
            failedTasks: () => {
              return Promise.reject();
            },
          };
        },
      },
    };

    Ajax.mockImplementation(() => {
      return modifiedMock;
    });

    const user = userEvent.setup();

    await act(async () => render(h(BaseRunDetails, runDetailsProps)));

    const statusFilter = screen.getByLabelText('Status');
    const select = new SelectHelper(statusFilter, user);
    expect(select.getSelectedOptions()).toEqual(['Failed']);
    const table = screen.getByRole('table');
    const rows = within(table).getAllByRole('row');
    expect(rows.length).toEqual(2);
    const targetRow = within(table).getAllByRole('row')[1];
    within(targetRow).getByText(failedTaskName);
    const failedStatus = within(targetRow).getAllByText('Failed');
    expect(failedStatus.length).toEqual(2);
    const targetStartText = makeCompleteDate(start);
    const targetEndText = makeCompleteDate(end);
    expect(targetRow.textContent).toContain(targetStartText);
    expect(targetRow.textContent).toContain(targetEndText);
  });
});
