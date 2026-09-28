/**
 * PFMEA Flow - modelo de datos v0.4.0 Local-first
 *
 * Este archivo define el contrato lógico que deberá conservar la futura
 * implementación React/TypeScript. El prototipo HTML utiliza el mismo modelo
 * en JavaScript y lo persiste localmente como JSON.
 *
 * Importante: las interfaces representan el objeto normalizado en memoria.
 * El JSON Schema de importación es deliberadamente tolerante a borradores y
 * las exigencias metodológicas se aplican por hito mediante CompletionGate.
 */

export const PFMEA_SCHEMA_VERSION = '0.4.0' as const;

export type ISODate = string;
export type ISODateTime = string;
export type UUID = string;

export type ProjectStatus =
  | 'draft'
  | 'in-review'
  | 'final'
  | 'archived'
  | 'replaced';


export type CompletionGate =
  | 'working'
  | 'complete-stage'
  | 'in-review'
  | 'final';

export type WorkflowStatus =
  | 'not-started'
  | 'in-progress'
  | 'complete'
  | 'review-required'
  | 'error'
  | 'not-applicable';

export type ProcessNodeType =
  | 'start'
  | 'end'
  | 'operation'
  | 'inspection'
  | 'decision'
  | 'transport'
  | 'storage'
  | 'wait'
  | 'external'
  | 'rework'
  | 'subprocess';

export type ProcessFlowType =
  | 'normal'
  | 'alternative'
  | 'reject'
  | 'rework'
  | 'exception'
  | 'return'
  | 'parallel';

export type ControlType = 'preventive' | 'detection';
export type ControlStatus = 'current' | 'proposed' | 'retired';

export type RiskDecision =
  | 'pending'
  | 'requires-action'
  | 'accepted-currently'
  | 'accepted-with-justification'
  | 'accepted-temporarily'
  | 'closed-after-action'
  | 'not-applicable';

export type RiskStatus =
  | 'pending'
  | 'evaluated'
  | 'action-open'
  | 'closed'
  | 'archived';

export type ActionStatus =
  | 'proposed'
  | 'accepted'
  | 'in-progress'
  | 'implemented'
  | 'pending-verification'
  | 'effectiveness-verified'
  | 'cancelled'
  | 'replaced';

export type ActionPriority = 'critical' | 'high' | 'medium' | 'low';

export interface PFMEAProject {
  schemaVersion: typeof PFMEA_SCHEMA_VERSION | string;
  appVersion: string;
  id: UUID;
  metadata: ProjectMetadata;
  scope: ProjectScope;
  team: TeamMember[];
  references: DocumentReference[];
  methodology: RiskMethodology;
  processMap: ProcessMap;
  functions: ProcessFunction[];
  failureModes: FailureMode[];
  effects: FailureEffect[];
  causes: FailureCause[];
  controls: Control[];
  controlLinks: ControlLink[];
  reactionPlans: ReactionPlan[];
  risks: RiskEvaluation[];
  actions: RiskAction[];
  revisionHistory: RevisionRecord[];
  exportHistory: ExportRecord[];
  workflow: ProjectWorkflow;

  /** Estado de navegación local. Es opcional y puede omitirse al exportar. */
  clientState?: ClientState;
}

export interface ProjectMetadata {
  name: string;
  code: string;
  revision: string;
  status: ProjectStatus;
  processName: string;
  productFamily: string;
  site: string;
  areaLine: string;
  owner: string;
  customer: string;
  projectReference: string;
  changeNumber: string;
  startDate: ISODate;
  targetDate: ISODate | '';
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  lastExternalBackupAt: ISODateTime | null;
  lastExportAt: ISODateTime | null;
  sourceProjectId: UUID | null;
  previousRevisionId: UUID | null;
  summaryOfChanges: string;
}

export interface ProjectScope {
  objective: string;
  processStart: string;
  processEnd: string;
  includedProducts: string;
  exclusions: string;
  assumptions: string;
  interfaces: string;
  externalProcesses: string;
  constraints: string;
}

export interface TeamMember {
  id: UUID;
  name: string;
  role: string;
  area: string;
  specialty: string;
}

export interface DocumentReference {
  id: UUID;
  code: string;
  title: string;
  revision: string;
  type: string;
  location: string;
  comment: string;
}

export interface RiskMethodology {
  method: 'RPN clásico' | string;
  scaleRange: { min: number; max: number };
  scales: {
    severity: RatingScale;
    occurrence: RatingScale;
    detection: RatingScale;
  };
  thresholds: RiskThresholds;
  specialCharacteristics: SpecialCharacteristic[];
}

export interface RatingScale {
  id: UUID;
  name: string;
  revision: string;
  locked: boolean;
  values: RatingCriterion[];
}

export interface RatingCriterion {
  score: number;
  title: string;
  description: string;
  examples: string[];
}

export interface RiskThresholds {
  criticalSeverity: number;
  reviewRpn: number;
  actionRpn: number;
  weakDetection: number;
  highOccurrence: number;
}

export interface SpecialCharacteristic {
  id: UUID;
  code: string;
  label: string;
}

export interface ProcessMap {
  confirmedAt: ISODateTime | null;
  confirmedBy: string;
  nodes: ProcessNode[];
  edges: ProcessEdge[];
  validationAcknowledgements: ValidationAcknowledgement[];
}

export interface ProcessNode {
  id: UUID;
  code: string;
  name: string;
  type: ProcessNodeType;
  description: string;
  area: string;
  station: string;
  inputs: string[];
  outputs: string[];
  equipment: string[];
  materials: string[];
  parameters: string[];
  responsible: string;
  analysisOrder: number;
  position: Point;
  status: 'active' | 'archived';
  archived: boolean;
}

export interface Point {
  x: number;
  y: number;
}

export interface ProcessEdge {
  id: UUID;
  sourceNodeId: UUID;
  targetNodeId: UUID;
  flowType: ProcessFlowType;
  condition: string;
  label: string;
  archived: boolean;
}

export interface ValidationAcknowledgement {
  id: UUID;
  issueCode: string;
  reason: string;
  responsible: string;
  acknowledgedAt: ISODateTime;
}

export interface ProcessFunction {
  id: UUID;
  stageId: UUID;
  description: string;
  requirement: string;
  specification: string;
  unit: string;
  tolerance: string;
  inputs: string[];
  outputs: string[];
  customer: string;
  specialCharacteristicIds: UUID[];
  referenceIds: UUID[];
  status: 'active' | 'archived';
  notes: string;
}

export interface FailureMode {
  id: UUID;
  functionId: UUID;
  description: string;
  category: string;
  source: 'team' | 'library' | 'historical' | 'standard' | string;
  status: 'active' | 'archived' | 'not-applicable';
  dispositionReason: string;
}

export interface FailureEffect {
  id: UUID;
  failureModeId: UUID;
  description: string;
  level:
    | 'local'
    | 'next-process'
    | 'product'
    | 'customer'
    | 'safety'
    | 'regulatory'
    | 'environmental'
    | 'business'
    | string;
  affectedParty: string;
  severity: number | null;
  severityRationale: string;
  classification: string;
  specialCharacteristicIds: UUID[];
  referenceIds: UUID[];
  active: boolean;
}

export interface FailureCause {
  id: UUID;
  failureModeId: UUID;
  description: string;
  category:
    | 'person'
    | 'machine'
    | 'method'
    | 'material'
    | 'measurement'
    | 'environment'
    | 'process-design'
    | 'software'
    | 'supplier'
    | 'other'
    | string;
  mechanism: string;
  trigger: string;
  evidence: string;
  dataSource: string;
  status: 'active' | 'archived' | 'not-applicable';
  notes: string;
  controlAbsence?: {
    preventiveConfirmed: boolean;
    detectionConfirmed: boolean;
  };
}

export interface Control {
  id: UUID;
  code: string;
  type: ControlType;
  subtype: string;
  description: string;
  status: ControlStatus;
  method: string;
  frequency: string;
  sampleSize: string;
  acceptanceCriteria: string;
  responsible: string;
  record: string;
  automatic: boolean;
  automaticReject: boolean;
  alarm: boolean;
  interlock: boolean;
  validated: boolean;
  challengeTestRequired: boolean;
  challengeTestCompleted: boolean;
  evidence: string;
  referenceIds: UUID[];
  notes: string;
}

/**
 * Relación many-to-many. Un control puede aplicar a varias causas y una causa
 * puede tener varios controles. No se duplica el objeto Control por cada fila.
 */
export interface ControlLink {
  id: UUID;
  controlId: UUID;
  causeId: UUID | null;
  failureModeId: UUID | null;
  stageId: UUID | null;
  relationship: 'prevents' | 'detects' | 'monitors' | string;
}

export interface ReactionPlan {
  id: UUID;
  code: string;
  trigger: string;
  immediateAction: string;
  stopLine: boolean;
  segregationRequired: boolean;
  segregationScope: string;
  cutoffPoint: string;
  additionalInspection: string;
  adjustmentCorrection: string;
  materialDisposition: string;
  restartCriteria: string;
  responsible: string;
  escalation: string;
  record: string;
  notification: string;
  linkedControlIds: UUID[];
  linkedCauseIds: UUID[];
  notes: string;
}

export interface RiskRating {
  severity: number | null;
  occurrence: number | null;
  detection: number | null;
  rpn: number | null;
  severityRationale: string;
  occurrenceRationale: string;
  detectionRationale: string;
}

export interface ProjectedRiskRating {
  severity: number | null;
  occurrence: number | null;
  detection: number | null;
  rpn: number | null;
  rationale: string;
}

export interface VerifiedRiskRating extends ProjectedRiskRating {
  verifiedAt: ISODateTime;
  verifiedBy: string;
  evidence: string[];
}

/**
 * Unidad básica del PFMEA: una causa evaluada contra su efecto gobernante.
 * La gravedad proviene del mayor efecto activo del modo de falla; ocurrencia y
 * detección se evalúan para esta causa y sus controles.
 */
export interface RiskEvaluation {
  id: UUID;
  code: string;
  causeId: UUID;
  governingEffectId: UUID | null;
  current: RiskRating;
  decision: RiskDecision;
  acceptanceJustification: string;
  target: ProjectedRiskRating | null;
  residual: VerifiedRiskRating | null;
  actionIds: UUID[];
  status: RiskStatus;
  notes: string;
}

export interface RiskAction {
  id: UUID;
  code: string;
  description: string;
  type: string;
  linkedRiskIds: UUID[];
  responsible: string;
  area: string;
  targetDate: ISODate | '';
  priority: ActionPriority;
  status: ActionStatus;
  implementedDate: ISODate | '';
  evidence: string[];
  result: string;
  effectiveness: EffectivenessVerification;
  affects: {
    severity: boolean;
    occurrence: boolean;
    detection: boolean;
  };
  createdControlIds: UUID[];
  modifiedControlIds: UUID[];
  notes: string;
}

export interface EffectivenessVerification {
  status: 'not-started' | 'pending-verification' | 'effectiveness-verified';
  result: string;
  verifiedBy: string;
  verifiedAt: ISODateTime | null;
  notes: string;
}

export interface RevisionRecord {
  id: UUID;
  revision: string;
  date: ISODate;
  description: string;
  responsible: string;
  status: ProjectStatus;
  sourceProjectId: UUID | null;
}

export interface ExportRecord {
  id: UUID;
  type: 'project-json' | 'csv' | 'map-svg' | 'xlsx' | 'pdf' | string;
  generatedAt: ISODateTime;
  projectStatus: ProjectStatus;
  revision: string;
  filename: string;
}

export interface ProjectWorkflow {
  sectionStatus: {
    setup: WorkflowStatus;
    map: WorkflowStatus;
    analysis: WorkflowStatus;
    actions: WorkflowStatus;
    review: WorkflowStatus;
    export: WorkflowStatus;
  };
  stageStatus: Record<UUID, WorkflowStatus>;
  reviewRequiredStageIds: UUID[];
  closure: {
    comment: string;
    exceptions: ClosureException[];
    confirmedBy: string;
    confirmedAt: ISODateTime | null;
  };
}

export interface ClosureException {
  id: UUID;
  description: string;
  reason: string;
  responsible: string;
  targetDate: ISODate | '';
}

export interface ClientState {
  lastRoute: string;
  selectedMapNodeId: UUID | null;
  selectedFunctionId: UUID | null;
  selectedFailureModeId: UUID | null;
  selectedCauseId: UUID | null;
  selectedRiskId: UUID | null;
  setupTab: 'identification' | 'scope' | 'team' | 'references' | 'scales';
  analysisTab: 'chain' | 'functions' | 'failures' | 'effects-causes' | 'controls' | 'evaluation';
  libraryFilter: string;
  showAdvancedFields: boolean;
}

/**
 * Los campos visibles y obligatorios no se deducen de estas interfaces.
 * - working: guardado libre y advertencias suaves.
 * - complete-stage: cadena mínima completa por causa.
 * - in-review: identificación, alcance, mapa y etapas cerradas.
 * - final: responsable y justificaciones de excepción completas.
 *
 * Ver pfmea-completion-rules.json para el contrato ejecutable de hitos.
 */

/**
 * Relación jerárquica principal:
 *
 * ProcessNode -> ProcessFunction -> FailureMode -> FailureEffect
 *                                           -> FailureCause -> RiskEvaluation
 *                                                           -> RiskAction
 * FailureCause <-> Control mediante ControlLink
 * FailureCause / Control <-> ReactionPlan mediante arrays de identificadores
 */
