import { DeepPartial } from '@terra-ui-packages/core-utils';
import { act, render, screen } from '@testing-library/react';
import { h } from 'react-hyperscript-helpers';
import { Ajax } from 'src/libs/ajax';
import { LeoAppStatus, ListAppResponse } from 'src/libs/ajax/leonardo/models/app-models';
import { reportError } from 'src/libs/error';
import { WorkspaceWrapper } from 'src/libs/workspace-utils';
import { StorageDetails } from 'src/pages/workspaces/workspace/useWorkspace';
import { asMockedFn } from 'src/testing/test-utils';
import { defaultAzureWorkspace, defaultGoogleBucketOptions } from 'src/testing/workspace-fixtures';

import { WorkspaceData } from './Data';

type WorkspaceContainerExports = typeof import('src/pages/workspaces/workspace/WorkspaceContainer');
jest.mock('src/pages/workspaces/workspace/WorkspaceContainer', (): WorkspaceContainerExports => {
  return {
    ...jest.requireActual<WorkspaceContainerExports>('src/pages/workspaces/workspace/WorkspaceContainer'),
    wrapWorkspace: jest.fn().mockImplementation((_opts) => (wrappedComponent) => wrappedComponent),
  };
});

type AjaxExports = typeof import('src/libs/ajax');
jest.mock('src/libs/ajax', (): AjaxExports => {
  return {
    ...jest.requireActual<AjaxExports>('src/libs/ajax'),
    Ajax: jest.fn(),
  };
});

jest.mock('src/libs/error', () => ({
  ...jest.requireActual('src/libs/error'),
  reportError: jest.fn(),
}));

// When Data.js is broken apart and the WorkspaceData component is converted to TypeScript,
// this type belongs there.
interface WorkspaceDataProps {
  namespace: string;
  name: string;
  workspace: WorkspaceWrapper;
  refreshWorkspace: () => void;
  storageDetails: StorageDetails;
}
type AjaxContract = ReturnType<typeof Ajax>;

beforeAll(() => {
  jest.useFakeTimers();
});

afterAll(() => {
  jest.useRealTimers();
});

describe('WorkspaceData', () => {
  type SetupOptions = {
    namespace?: string;
    name?: string;
    workspace: WorkspaceWrapper;
    refreshWorkspace?: () => void;
    storageDetails?: StorageDetails;
    status: LeoAppStatus;
  };
  type SetupResult = {
    workspaceDataProps: WorkspaceDataProps;
    listAppResponse: DeepPartial<ListAppResponse>;
    mockGetSchema: jest.Mock;
    mockListAppsV2: jest.Mock;
  };

  const populatedAzureStorageOptions = {
    azureContainerRegion: 'eastus',
    azureContainerUrl: 'container-url',
    azureContainerSasUrl: 'container-url?sas',
  };

  // SIFERS setup, see: https://medium.com/@kolodny/testing-with-sifers-c9d6bb5b362
  function setup({
    namespace = 'test-namespace',
    name = 'test-name',
    workspace,
    refreshWorkspace = () => {},
    storageDetails = { ...defaultGoogleBucketOptions, ...populatedAzureStorageOptions },
    status = 'RUNNING',
  }: SetupOptions): SetupResult {
    const listAppResponse: DeepPartial<ListAppResponse> = {
      proxyUrls: {
        wds: 'https://fake.wds.url/',
      },
      appType: 'WDS',
    };

    const mockGetSchema = jest.fn().mockResolvedValue([]);
    const mockListAppsV2 = jest.fn().mockResolvedValue([{ ...listAppResponse, status }]);
    const mockAjax: DeepPartial<AjaxContract> = {
      Workspaces: {
        workspace: (_namespace, _name) => ({
          details: jest.fn().mockResolvedValue(workspace),
          listSnapshots: jest.fn().mockResolvedValue([]),
          entityMetadata: jest.fn().mockResolvedValue({}),
        }),
      },
      WorkspaceData: {
        getSchema: mockGetSchema,
      },
      Apps: {
        listAppsV2: mockListAppsV2,
      },
    };

    asMockedFn(Ajax).mockImplementation(() => mockAjax as AjaxContract);

    const workspaceDataProps: WorkspaceDataProps = {
      namespace,
      name,
      workspace,
      refreshWorkspace,
      storageDetails,
    };

    return { workspaceDataProps, listAppResponse, mockGetSchema, mockListAppsV2 };
  }

  it('displays a waiting message for an azure workspace that is still provisioning in WDS', async () => {
    // Arrange
    const { workspaceDataProps } = setup({
      workspace: defaultAzureWorkspace,
      status: 'PROVISIONING',
    });

    // Act
    await act(async () => {
      render(h(WorkspaceData, workspaceDataProps));
    });

    // Assert
    expect(screen.getByText(/Preparing your data tables/)).toBeVisible();
    expect(screen.queryByText(/Data tables are unavailable/)).toBeNull(); // no error message
  });

  it('displays an error message for an azure workspace whose status is ERROR', async () => {
    // Arrange
    const { workspaceDataProps } = setup({
      workspace: defaultAzureWorkspace,
      status: 'ERROR',
    });

    // Act
    await act(async () => {
      render(h(WorkspaceData, workspaceDataProps));
    });

    // Assert
    expect(screen.getByText(/Data tables are unavailable/)).toBeVisible();
    expect(screen.getByText(/An error occurred while preparing/)).toBeVisible(); // display error message
    expect(screen.queryByText(/Preparing your data tables/)).toBeNull(); // no waiting message
  });

  it('displays an error message for an azure workspace that fails when resolving the app', async () => {
    // Arrange
    const { workspaceDataProps, mockListAppsV2 } = setup({
      workspace: defaultAzureWorkspace,
      status: 'RUNNING',
    });

    const mockedError = new Error('app resolve error');
    mockListAppsV2.mockRejectedValue(mockedError);

    // Act
    await act(async () => {
      render(h(WorkspaceData, workspaceDataProps));
    });

    // Assert
    expect(screen.getByText(/Data tables are unavailable/)).toBeVisible();
    expect(screen.getByText(/An error occurred while preparing/)).toBeVisible(); // display error message
    expect(screen.queryByText(/Preparing your data tables/)).toBeNull(); // no waiting message
    expect(reportError).toHaveBeenCalledWith('Error resolving WDS app', mockedError);
  });

  it('displays an error message for an azure workspace that fails when loading schema info', async () => {
    // Arrange
    const { workspaceDataProps, mockGetSchema } = setup({
      workspace: defaultAzureWorkspace,
      status: 'RUNNING',
    });

    const mockedError = new Error('schema error');
    mockGetSchema.mockRejectedValue(mockedError);

    // Act
    await act(async () => {
      render(h(WorkspaceData, workspaceDataProps));
    });

    // Assert
    expect(screen.getByText(/Data tables are unavailable/)).toBeVisible();
    expect(screen.getByText(/An error occurred while preparing/)).toBeVisible(); // display error message
    expect(screen.queryByText(/Preparing your data tables/)).toBeNull(); // no waiting message
    expect(reportError).toHaveBeenCalledWith('Error loading WDS schema', mockedError);
  });

  it('stops polling for app status if app reaches an ERROR status', async () => {
    // Arrange
    const { workspaceDataProps, mockListAppsV2, listAppResponse, mockGetSchema } = setup({
      workspace: defaultAzureWorkspace,
      status: 'PROVISIONING',
    });

    mockListAppsV2
      .mockResolvedValueOnce([{ ...listAppResponse, status: 'PROVISIONING' }])
      .mockResolvedValueOnce([{ ...listAppResponse, status: 'ERROR' }]);

    // Act
    await act(async () => {
      render(h(WorkspaceData, workspaceDataProps));
    });

    // Assert
    expect(mockListAppsV2).toHaveBeenCalledTimes(1); // initial call, provisioning
    expect(screen.getByText(/Preparing your data tables/)).toBeVisible();

    // Act
    await act(async () => {
      jest.advanceTimersByTime(30000);
    });

    // Assert
    expect(mockListAppsV2).toHaveBeenCalledTimes(2); // second call, error
    expect(screen.getByText(/An error occurred while preparing/)).toBeVisible(); // display error message
    expect(screen.queryByText(/Preparing your data tables/)).toBeNull(); // no waiting message

    // Act
    await act(async () => {
      jest.advanceTimersByTime(30000);
    });

    // Assert
    expect(mockListAppsV2).toHaveBeenCalledTimes(2); // no further calls
    expect(mockGetSchema).not.toHaveBeenCalled(); // never tried fetching schema, which depends on app status
  });

  it('stops polling for schema info if an error occurs while doing so', async () => {
    // Arrange
    const { workspaceDataProps, mockListAppsV2, mockGetSchema } = setup({
      workspace: defaultAzureWorkspace,
      status: 'RUNNING',
    });

    mockGetSchema.mockRejectedValue(new Error('schema error'));

    // Act
    await act(async () => {
      render(h(WorkspaceData, workspaceDataProps));
    });

    // Assert
    expect(mockListAppsV2).toHaveBeenCalledTimes(1); // only expected call, provisioning
    expect(mockGetSchema).toHaveBeenCalledTimes(1); // only expected call, which resulted in an error
    expect(screen.getByText(/An error occurred while preparing/)).toBeVisible(); // display error message

    // Act
    await act(async () => {
      jest.advanceTimersByTime(30000);
    });

    // Assert
    expect(mockListAppsV2).toHaveBeenCalledTimes(1); // no further invocations
    expect(mockGetSchema).toHaveBeenCalledTimes(1); // no further invocations
  });

  it('polls for schema info until a PROVISIONING app is RUNNING', async () => {
    // Arrange
    const { workspaceDataProps, mockListAppsV2, listAppResponse, mockGetSchema } = setup({
      workspace: defaultAzureWorkspace,
      status: 'PROVISIONING',
    });

    mockListAppsV2
      .mockResolvedValueOnce([{ ...listAppResponse, status: 'PROVISIONING' }])
      .mockResolvedValueOnce([{ ...listAppResponse, status: 'PROVISIONING' }])
      .mockResolvedValueOnce([{ ...listAppResponse, status: 'RUNNING' }]);

    // Act
    await act(async () => {
      render(h(WorkspaceData, workspaceDataProps));
    });

    // Assert
    expect(mockListAppsV2).toHaveBeenCalledTimes(1); // initial call, provisioning
    expect(mockGetSchema).not.toHaveBeenCalled(); // don't fetch schema yet
    expect(screen.queryByText(/Select a data type/)).toBeNull();
    expect(screen.getByText(/Preparing your data tables/)).toBeVisible();

    // Act
    await act(async () => {
      jest.advanceTimersByTime(30000);
    });

    // Assert
    expect(mockListAppsV2).toHaveBeenCalledTimes(2); // second call, still provisioning
    expect(mockGetSchema).not.toHaveBeenCalled(); // don't fetch schema yet
    expect(screen.queryByText(/Select a data type/)).toBeNull();
    expect(screen.getByText(/Preparing your data tables/)).toBeVisible();

    // Act
    await act(async () => {
      jest.advanceTimersByTime(30000);
    });

    // Assert
    expect(mockListAppsV2).toHaveBeenCalledTimes(3); // third call, now running
    expect(mockGetSchema).toHaveBeenCalled(); // fetch schema once running

    expect(screen.getByText(/Select a data type/)).toBeVisible();
    expect(screen.queryByText(/Preparing your data tables/)).toBeNull(); // no waiting message
    expect(screen.queryByText(/Data tables are unavailable/)).toBeNull(); // no error message
  });
});
