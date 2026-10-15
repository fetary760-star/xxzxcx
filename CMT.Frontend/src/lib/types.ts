// Enums matching backend
export enum CapabilityStatus {
  NotAssessed = 0,
  FullCapability = 1,
  LimitedCapability = 2,
  NoCapability = 3,
  UnderDevelopment = 4,
}

export enum ComplianceStatus {
  NotReviewed = 0,
  Compliant = 1,
  NonCompliant = 2,
  PartiallyCompliant = 3,
  NotApplicable = 4,
}

export enum AuditStatus {
  NotStarted = 0,
  InProgress = 1,
  Completed = 2,
  RequiresFollowUp = 3,
  Closed = 4,
}

export enum ProficiencyLevel {
  NotRated = 0,
  Trainee = 1,
  Supervised = 2,
  Competent = 3,
  Expert = 4,
  Instructor = 5,
}

export enum ToolStatus {
  NotRequired = 0,
  Required = 1,
  Available = 2,
  OnOrder = 3,
  NeedsCalibration = 4,
  OutOfService = 5,
}

export enum WorkflowAction {
  Created = 0,
  Updated = 1,
  Submitted = 2,
  Approved = 3,
  Rejected = 4,
  Delegated = 5,
  Completed = 6,
  Archived = 7,
  Added = 8,
  Deleted = 9,
  Amended = 10,
  ReturnedForRevision = 11,
  AssignmentChanged = 12,
}

export enum DelegationStatus {
  Active = 0,
  Revoked = 1,
  Expired = 2,
}

export enum DirectiveApplicability {
  NotDetermined = 0,
  Applicable = 1,
  NotApplicable = 2,
  Superseded = 3,
}

export enum BulletinCategory {
  Mandatory = 0,
  Recommended = 1,
  Optional = 2,
  Alert = 3,
}

// Interfaces
export interface Shop {
  id: string;
  name: string;
  certificateNumber: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
  phone: string;
  email: string;
  accountableManager: string;
  qualityManager: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Component {
  id: string;
  partNumber: string;
  description: string;
  manufacturer: string;
  modelSeries: string;
  ataChapterId: string;
  ataChapterNumber: string;
  ataChapterTitle: string;
  shopId: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CapabilityAssessment {
  id: string;
  componentId: string;
  componentPartNumber: string;
  componentDescription: string;
  shopId: string;
  status: CapabilityStatus;
  justification: string;
  hasRequiredTooling: boolean;
  hasRequiredTraining: boolean;
  hasTechnicalData: boolean;
  hasRequiredFacilities: boolean;
  limitations: string;
  correctiveActions: string;
  assessmentDate: string | null;
  nextReviewDate: string | null;
  assessedBy: string;
  approvedBy: string;
}

export interface AirworthinessDirective {
  id: string;
  adNumber: string;
  title: string;
  description: string;
  effectiveDate: string | null;
  applicability: DirectiveApplicability;
  complianceStatus: ComplianceStatus;
  complianceMethod: string;
  notes: string;
  componentId: string;
}

export interface ServiceBulletin {
  id: string;
  sbNumber: string;
  title: string;
  description: string;
  issueDate: string | null;
  revisionDate: string | null;
  revision: string;
  category: BulletinCategory;
  complianceStatus: ComplianceStatus;
  complianceNotes: string;
  componentId: string;
}

export interface ToolNeedsAnalysis {
  id: string;
  toolName: string;
  toolPartNumber: string;
  description: string;
  manufacturer: string;
  status: ToolStatus;
  calibrationDueDate: string | null;
  calibrationInterval: string;
  storageLocation: string;
  quantityRequired: number;
  quantityAvailable: number;
  componentId: string;
  componentPartNumber: string;
  shopId: string;
}

export interface SelfAuditChecklist {
  id: string;
  section: string;
  itemNumber: string;
  question: string;
  regulatoryReference: string;
  complianceStatus: ComplianceStatus;
  findings: string;
  correctiveAction: string;
  dueDate: string | null;
  completionDate: string | null;
  assignedTo: string;
  auditStatus: AuditStatus;
  shopId: string;
}

export interface EmployeeProficiency {
  id: string;
  employeeName: string;
  employeeId: string;
  jobTitle: string;
  department: string;
  certifications: string;
  proficiencyLevel: ProficiencyLevel;
  skillAreas: string;
  lastTrainingDate: string | null;
  nextTrainingDue: string | null;
  trainingHistory: string;
  isActive: boolean;
  shopId: string;
}

export interface WorkflowAuditLog {
  id: string;
  action: string;
  workflowAction: WorkflowAction;
  entityType: string;
  entityId: string;
  performedBy: string;
  details: string;
  timestamp: string;
}

export interface ResponsibilityDelegation {
  id: string;
  delegatedBy: string;
  delegatedTo: string;
  responsibility: string;
  scope: string;
  status: DelegationStatus;
  effectiveDate: string;
  expirationDate: string | null;
  shopId: string;
}

export interface ShopDashboardSummary {
  shopId: string;
  shopName: string;
  totalComponents: number;
  fullCapabilityCount: number;
  limitedCapabilityCount: number;
  noCapabilityCount: number;
  pendingAuditItems: number;
  overdueAuditItems: number;
  activeEmployees: number;
  toolsNeedingCalibration: number;
  activeDelegations: number;
}