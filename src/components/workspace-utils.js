import debouncePromise from 'debounce-promise';
import _ from 'lodash/fp';
import { useState } from 'react';
import { div, h, span } from 'react-hyperscript-helpers';
import { CloudProviderIcon } from 'src/components/CloudProviderIcon';
import { AsyncCreatableSelect, Clickable, DelayedRender, Link, VirtualizedSelect } from 'src/components/common';
import { icon, spinner } from 'src/components/icons';
import TooltipTrigger from 'src/components/TooltipTrigger';
import { Ajax, useReplaceableAjaxExperimental } from 'src/libs/ajax';
import colors from 'src/libs/colors';
import { withErrorReporting } from 'src/libs/error';
import Events, { extractWorkspaceDetails } from 'src/libs/events';
import * as Nav from 'src/libs/nav';
import { getLocalPref, setLocalPref } from 'src/libs/prefs';
import { useCancellation, useInstance, useOnMount, useStore, withDisplayName } from 'src/libs/react-utils';
import { workspacesStore } from 'src/libs/state';
import * as Style from 'src/libs/style';
import * as Utils from 'src/libs/utils';
import { getCloudProviderFromWorkspace } from 'src/libs/workspace-utils';

export const useWorkspaces = (fieldsArg, stringAttributeMaxLength) => {
  const signal = useCancellation();
  const [loading, setLoading] = useState(false);
  const workspaces = useStore(workspacesStore);
  const ajax = useReplaceableAjaxExperimental();

  const fields = fieldsArg || [
    'accessLevel',
    'public',
    'workspace',
    'workspace.attributes.description',
    'workspace.attributes.tag:tags',
    'workspace.workspaceVersion',
  ];

  const refresh = _.flow(
    withErrorReporting('Error loading workspace list'),
    Utils.withBusyState(setLoading)
  )(async () => {
    const ws = await ajax(signal).Workspaces.list(fields, stringAttributeMaxLength);
    workspacesStore.set(ws);
  });
  useOnMount(() => {
    refresh();
  });
  return { workspaces, refresh, loading };
};

export const useWorkspaceDetails = ({ namespace, name }, fields) => {
  const [workspace, setWorkspace] = useState();

  const [loading, setLoading] = useState(true);
  const signal = useCancellation();

  const refresh = _.flow(
    withErrorReporting('Error loading workspace details'),
    Utils.withBusyState(setLoading)
  )(async () => {
    const ws = await Ajax(signal).Workspaces.workspace(namespace, name).details(fields);
    setWorkspace(ws);
  });

  useOnMount(() => {
    refresh();
  }, []);

  return { workspace, refresh, loading };
};

export const withWorkspaces = (WrappedComponent) => {
  return withDisplayName('withWorkspaces', (props) => {
    const { workspaces, refresh, loading } = useWorkspaces();
    return h(WrappedComponent, {
      ...props,
      workspaces,
      loadingWorkspaces: loading,
      refreshWorkspaces: refresh,
    });
  });
};

export const WorkspaceSelector = ({ workspaces, value, onChange, id, 'aria-label': ariaLabel, ...props }) => {
  const options = _.flow(
    _.sortBy((ws) => ws.workspace.name.toLowerCase()),
    _.map(({ workspace: { workspaceId, name, cloudPlatform, bucketName } }) => ({
      value: workspaceId,
      label: name,
      workspace: { cloudPlatform, bucketName },
    }))
  )(workspaces);
  return h(VirtualizedSelect, {
    id,
    'aria-label': ariaLabel || 'Select a workspace',
    placeholder: 'Select a workspace',
    disabled: !workspaces,
    value,
    onChange: ({ value }) => onChange(value),
    options,
    ...props,
  });
};

export const WorkspaceTagSelect = (props) => {
  const signal = useCancellation();
  const getTagSuggestions = useInstance(() =>
    debouncePromise(
      withErrorReporting('Error loading tags', async (text) => {
        return _.map(({ tag, count }) => {
          return { value: tag, label: `${tag} (${count})` };
        }, await Ajax(signal).Workspaces.getTags(text, 10));
      }),
      250
    )
  );
  return h(AsyncCreatableSelect, {
    allowCreateWhileLoading: true,
    defaultOptions: true,
    loadOptions: getTagSuggestions,
    ...props,
  });
};

export const WorkspaceStarControl = ({ workspace, stars, setStars, style, updatingStars, setUpdatingStars }) => {
  const {
    workspace: { workspaceId },
  } = workspace;
  const isStarred = _.includes(workspaceId, stars);

  // Thurloe has a limit of 2048 bytes for its VALUE column. That means we can store a max of 55
  // workspaceIds in list format. We'll use 50 because it's a nice round number and should be plenty
  // for the intended use case. If we find that 50 is not enough, consider introducing more powerful
  // workspace organization functionality like folders
  const MAX_STARRED_WORKSPACES = 50;
  const maxStarredWorkspacesReached = _.size(stars) >= MAX_STARRED_WORKSPACES;

  const refreshStarredWorkspacesList = async () => {
    const { starredWorkspaces } = Utils.kvArrayToObject((await Ajax().User.profile.get()).keyValuePairs);
    return _.isEmpty(starredWorkspaces) ? [] : _.split(',', starredWorkspaces);
  };

  const toggleStar = _.flow(
    Utils.withBusyState(setUpdatingStars),
    withErrorReporting(`Unable to ${isStarred ? 'unstar' : 'star'} workspace`)
  )(async (star) => {
    const refreshedStarredWorkspaceList = await refreshStarredWorkspacesList();
    const updatedWorkspaceIds = star
      ? _.concat(refreshedStarredWorkspaceList, [workspaceId])
      : _.without([workspaceId], refreshedStarredWorkspaceList);
    await Ajax().User.profile.setPreferences({ starredWorkspaces: _.join(',', updatedWorkspaceIds) });
    Ajax().Metrics.captureEvent(Events.workspaceStar, { workspaceId, starred: star, ...extractWorkspaceDetails(workspace.workspace) });
    setStars(updatedWorkspaceIds);
  });

  return h(
    Clickable,
    {
      tagName: 'span',
      role: 'checkbox',
      'aria-checked': isStarred,
      tooltip: Utils.cond(
        [updatingStars, () => 'Updating starred workspaces.'],
        [isStarred, () => 'Unstar this workspace.'],
        [!isStarred && !maxStarredWorkspacesReached, () => 'Star this workspace. Starred workspaces will appear at the top of your workspace list.'],
        [
          !isStarred && maxStarredWorkspacesReached,
          () => [
            'A maximum of ',
            MAX_STARRED_WORKSPACES,
            ' workspaces can be starred. Please un-star another workspace before starring this workspace.',
          ],
        ]
      ),
      'aria-label': isStarred ? 'This workspace is starred' : '',
      className: 'fa-layers fa-fw',
      disabled: updatingStars || (maxStarredWorkspacesReached && !isStarred),
      style: { verticalAlign: 'middle', ...style },
      onKeyDown: (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          e.target.click();
        }
      },
      onClick: () => toggleStar(!isStarred),
    },
    [updatingStars ? spinner({ size: 20 }) : icon('star', { size: 20, color: isStarred ? colors.warning() : colors.light(2) })]
  );
};

export const WorkspaceSubmissionStatusIcon = ({ status, loadingSubmissionStats, size = 20 }) => {
  return Utils.cond(
    [
      loadingSubmissionStats,
      () =>
        h(DelayedRender, [
          h(
            TooltipTrigger,
            {
              content: 'Loading submission status',
              side: 'left',
            },
            [spinner({ size })]
          ),
        ]),
    ],
    [
      status,
      () =>
        h(
          TooltipTrigger,
          {
            content: span(['Last submitted workflow status: ', span({ style: { fontWeight: 600 } }, [_.startCase(status)])]),
            side: 'left',
          },
          [
            Utils.switchCase(
              status,
              ['success', () => icon('success-standard', { size, style: { color: colors.success() }, 'aria-label': 'Workflow Status Success' })],
              ['failure', () => icon('error-standard', { size, style: { color: colors.danger(0.85) }, 'aria-label': 'Workflow Status Failure' })],
              ['running', () => icon('sync', { size, style: { color: colors.success() }, 'aria-label': 'Workflow Status Running' })]
            ),
          ]
        ),
    ],
    () => div({ className: 'sr-only' }, ['No workflows have been run'])
  );
};

export const recentlyViewedPersistenceId = 'workspaces/recentlyViewed';

export const updateRecentlyViewedWorkspaces = (workspaceId) => {
  const recentlyViewed = getLocalPref(recentlyViewedPersistenceId)?.recentlyViewed || [];
  // Recently viewed workspaces are limited to 4. Additionally, if a user clicks a workspace multiple times,
  // we only want the most recent instance stored in the list.
  const updatedRecentlyViewed = _.flow(
    _.remove({ workspaceId }),
    _.concat([{ workspaceId, timestamp: Date.now() }]),
    _.orderBy(['timestamp'], ['desc']),
    _.take(4)
  )(recentlyViewed);
  setLocalPref(recentlyViewedPersistenceId, { recentlyViewed: updatedRecentlyViewed });
};

export const RecentlyViewedWorkspaceCard = ({ workspace, submissionStatus, loadingSubmissionStats, timestamp }) => {
  const {
    workspace: { namespace, name },
  } = workspace;

  const dateViewed = Utils.makeCompleteDate(new Date(parseInt(timestamp)).toString());

  return h(
    Clickable,
    {
      style: {
        ...Style.elements.card.container,
        maxWidth: 'calc(25% - 10px)',
        margin: '0 0.25rem',
        lineHeight: '1.5rem',
        flex: '0 1 calc(25% - 10px)',
      },
      href: Nav.getLink('workspace-dashboard', { namespace, name }),
      onClick: () => {
        Ajax().Metrics.captureEvent(Events.workspaceOpenFromRecentlyViewed, extractWorkspaceDetails(workspace.workspace));
      },
    },
    [
      div({ style: { flex: 'none' } }, [
        div({ style: { color: colors.accent(), ...Style.noWrapEllipsis, fontSize: 16, marginBottom: 7 } }, name),
        div({ style: { display: 'flex', justifyContent: 'space-between' } }, [
          div({ style: { ...Style.noWrapEllipsis, whiteSpace: 'pre-wrap', fontStyle: 'italic' } }, `Viewed ${dateViewed}`),
          div({ style: { display: 'flex', alignItems: 'center' } }, [
            h(WorkspaceSubmissionStatusIcon, {
              status: submissionStatus,
              loadingSubmissionStats,
            }),
            h(CloudProviderIcon, { cloudProvider: getCloudProviderFromWorkspace(workspace), style: { marginLeft: 5 } }),
          ]),
        ]),
      ]),
    ]
  );
};

export const NoWorkspacesMessage = ({ onClick }) => {
  return div({ style: { fontSize: 20, margin: '1rem' } }, [
    div([
      'To get started, ',
      h(
        Link,
        {
          onClick,
          style: { fontWeight: 600 },
        },
        ['Create a New Workspace']
      ),
    ]),
    div({ style: { marginTop: '1rem', fontSize: 16 } }, [
      h(
        Link,
        {
          ...Utils.newTabLinkProps,
          href: 'https://support.terra.bio/hc/en-us/articles/360024743371',
        },
        ["What's a workspace?"]
      ),
    ]),
  ]);
};
