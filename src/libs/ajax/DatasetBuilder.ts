// Types that can be used to create a criteria.
import _ from 'lodash/fp';

export interface DomainOption {
  kind: 'domain';
  id: number;
  category: string;
  conceptCount: number;
  participantCount: number;
  root: Concept;
}

export interface ProgramDataOption {
  kind: 'range' | 'list';
  id: number;
  name: string;
}

export interface ProgramDataRangeOption extends ProgramDataOption {
  kind: 'range';
  min: number;
  max: number;
}

export interface ProgramDataListValue {
  id: number;
  name: string;
}

export interface ProgramDataListOption extends ProgramDataOption {
  kind: 'list';
  values: ProgramDataListValue[];
}

export interface DatasetResponse {
  name: string;
  id: string;
  description: string;
  programDataOptions: (ProgramDataRangeOption | ProgramDataListOption)[];
  domainOptions: DomainOption[];
  learnMoreLink: string;
  accessLevel: AccessLevel;
  featureValueGroups: FeatureValueGroup[];
}

/** A specific criteria based on a type. */
export interface Criteria {
  kind: 'domain' | 'range' | 'list';
  name: string;
  id: number;
  count: number;
}

export interface DomainCriteria extends Criteria {
  kind: 'domain';
  domainOption: DomainOption;
}

export interface ProgramDataRangeCriteria extends Criteria {
  kind: 'range';
  rangeOption: ProgramDataRangeOption;
  low: number;
  high: number;
}

export interface ProgramDataListCriteria extends Criteria {
  kind: 'list';
  listOption: ProgramDataListOption;
  values: ProgramDataListValue[];
}

export type AnyCriteria = DomainCriteria | ProgramDataRangeCriteria | ProgramDataListCriteria;

/** A group of criteria. */
export interface CriteriaGroup {
  name: string;
  criteria: AnyCriteria[];
  mustMeet: boolean;
  meetAll: boolean;
  count: number;
}

export interface Cohort extends DatasetBuilderType {
  criteriaGroups: CriteriaGroup[];
}

export interface ConceptSet extends DatasetBuilderType {
  featureValueGroupName: string;
}

export interface DatasetBuilderType {
  name: string;
}

export type DatasetBuilderValue = DatasetBuilderType;

export type FeatureValueGroup = {
  values: DatasetBuilderValue[];
  name: string;
  id: number;
};

export interface GetConceptsResponse {
  result: Concept[];
}

export interface Concept {
  id: number;
  name: string;
  count: number;
  hasChildren: boolean;
}

type DatasetRequest = {
  cohorts: Cohort[];
  conceptSets: ConceptSet[];
  valuesSets: { domain: string; values: DatasetBuilderValue[] }[];
};

type DatasetAccessRequest = {
  name: string;
  researchPurposeStatement: string;
  datasetRequest: DatasetRequest;
};

type DatasetParticipantCountRequest = {
  cohorts: Cohort[];
};

export interface DatasetBuilderContract {
  retrieveDataset: (datasetId: string) => Promise<DatasetResponse>;
  getConcepts: (parent: Concept) => Promise<GetConceptsResponse>;
  requestAccess: (request: DatasetAccessRequest) => Promise<void>;
  getParticipantCount: (request: DatasetParticipantCountRequest) => Promise<number>;
}

type AccessLevel = 'Owner' | 'Reader' | 'Discoverer';

const dummyConcepts = [
  // IDs must be unique.
  { id: 100, name: 'Condition', count: 100, hasChildren: true },
  { id: 101, name: 'Clinical Finding', count: 100, hasChildren: true },
  { id: 102, name: 'Disease', count: 100, hasChildren: true },
  { id: 103, name: 'Disorder by body site', count: 100, hasChildren: false },
  { id: 104, name: 'Inflammatory disorder', count: 100, hasChildren: false },
  { id: 105, name: 'Degenerative disorder', count: 100, hasChildren: false },
  { id: 106, name: 'Metabolic disease', count: 100, hasChildren: false },
  { id: 107, name: 'Finding by site', count: 100, hasChildren: false },
  { id: 108, name: 'Neurological finding', count: 100, hasChildren: false },

  { id: 200, name: 'Procedure', count: 100, hasChildren: true },
  { id: 201, name: 'Procedure', count: 100, hasChildren: true },
  { id: 202, name: 'Surgery', count: 100, hasChildren: false },
  { id: 203, name: 'Heart Surgery', count: 100, hasChildren: false },
  { id: 204, name: 'Cancer Surgery', count: 100, hasChildren: false },

  { id: 300, name: 'Observation', count: 100, hasChildren: true },
  { id: 301, name: 'Blood Pressure', count: 100, hasChildren: false },
  { id: 302, name: 'Weight', count: 100, hasChildren: false },
  { id: 303, name: 'Height', count: 100, hasChildren: false },
];

export const getConceptForId = (id: number): Concept => {
  return _.find({ id }, dummyConcepts)!;
};

const dummyConceptToParent = [
  // the parent of 101 is 100, etc
  [101, 100],
  [102, 101],
  [103, 102],
  [104, 102],
  [105, 102],
  [106, 102],
  [107, 101],
  [108, 101],
  [201, 200],
  [202, 201],
  [203, 201],
  [204, 201],
  [301, 300],
  [302, 300],
  [303, 300],
];

export const dummyDatasetDetails = (datasetId: string): DatasetResponse => ({
  name: 'AnalytiXIN',
  id: datasetId,
  description:
    'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt. Ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.<br><br>Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt. Ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.',
  programDataOptions: [
    { id: 1, name: 'Year of birth', kind: 'range', min: 1900, max: 2023 },
    {
      id: 2,
      name: 'Ethnicity',
      kind: 'list',
      values: [
        { name: 'Hispanic or Latino', id: 20 },
        { name: 'Not Hispanic or Latino', id: 21 },
        { name: 'No Matching Concept', id: 0 },
      ],
    },
    {
      id: 3,
      name: 'Gender identity',
      kind: 'list',
      values: [
        { name: 'FEMALE', id: 22 },
        { name: 'MALE', id: 23 },
        { name: 'No Matching Concept', id: 0 },
      ],
    },
    {
      id: 4,
      name: 'Race',
      kind: 'list',
      values: [
        { name: 'American Indian or Alaska Native', id: 24 },
        { name: 'Asian', id: 25 },
        { name: 'Black', id: 26 },
        { name: 'White', id: 27 },
        { name: 'No Matching Concept', id: 0 },
      ],
    },
  ],
  domainOptions: [
    {
      kind: 'domain',
      id: 10,
      category: 'Condition',
      conceptCount: 18000,
      participantCount: 12500,
      root: getConceptForId(100),
    },
    {
      kind: 'domain',
      id: 11,
      category: 'Procedure',
      conceptCount: 22500,
      participantCount: 11328,
      root: getConceptForId(200),
    },
    {
      kind: 'domain',
      id: 12,
      category: 'Observation',
      conceptCount: 12300,
      participantCount: 23223,
      root: getConceptForId(300),
    },
  ],
  learnMoreLink: '',
  accessLevel: 'Reader',
  featureValueGroups: [
    {
      values: [{ name: 'condition column 1' }, { name: 'condition column 2' }],
      name: 'Condition',
      id: 0,
    },
    {
      values: [{ name: 'observation column 1' }, { name: 'observation column 2' }],
      name: 'Observation',
      id: 1,
    },
    {
      values: [{ name: 'procedure column 1' }, { name: 'procedure column 2' }],
      name: 'Procedure',
      id: 2,
    },
    {
      values: [{ name: 'surveys column 1' }, { name: 'surveys column 2' }],
      name: 'Surveys',
      id: 2,
    },
    {
      values: [{ name: 'demographics column 1' }, { name: 'demographics column 2' }],
      name: 'Person',
      id: 3,
    },
  ],
});

const getDummyConcepts = async (parent: Concept): Promise<GetConceptsResponse> => {
  // Use a 1s delay to simulate server response time.
  await new Promise((resolve) => setTimeout(resolve, 1000));
  return {
    result: _.flow(
      _.filter(([_childId, parentId]) => parent.id === parentId),
      _.map(_.head),
      _.map(getConceptForId)
    )(dummyConceptToParent),
  };
};

export const DatasetBuilder = (): DatasetBuilderContract => ({
  retrieveDataset: (datasetId) => Promise.resolve(dummyDatasetDetails(datasetId)),
  getConcepts: (parent: Concept) => Promise.resolve(getDummyConcepts(parent)),
  requestAccess: (_request) => Promise.resolve(),
  getParticipantCount: (_request) => Promise.resolve(100),
});
