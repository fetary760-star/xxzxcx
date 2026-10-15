/**
 * Table of Contents — SINGLE SOURCE OF TRUTH (v9)
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * The Self Evaluation tree used to be declared three separate times:
 *   - HierarchyTree.tsx      (FORM_CATEGORIES)
 *   - DocumentWorkspace.tsx  (FORM_TREE_STRUCTURE + TABLE_OF_CONTENTS_CATEGORIES)
 *   - TableOfContentForm.tsx (a flat list of checkboxes)
 * Those three copies drifted apart, which is why sub-forms appeared under the
 * wrong parent category. Every view now imports the tree from here, so the
 * structure can only ever be changed in one place.
 *
 * STRUCTURE (amended per revised Table of Contents)
 * -------------------------------------------------
 * Promoted top-level items, in order:
 *   1. PERIODIC CAPABILITY SELF-AUDIT  (MNT-1325)
 *   2. LETTER OF CONFIRMATION          (Manager role)
 *   3. AMENDMENT REQUEST               (Director role)
 *   4. 918                             (FAA)
 *   5. 918 A                           (CAA)
 *
 * Then the categories:
 *   DOCUMENTATION
 *     CMM REV. STATUS
 *     TASK CARD
 *     OTHERS (sub-group)
 *       SB  MNT-1420A  (Personnel)
 *       AD  MNT-1420B  (Shop Team Leader)
 *   TRAINING DOCUMENT
 *     MAINTENANCE AND GENERIC COURSES
 *       TRAINING VERIFICATION (INSPECTION)
 *       TRAINING VERIFICATION (TECHNICIAN)
 *       INSPECTION PROFICIENCY (FOR INSPECTION)  MNT-1378
 *       COMPETENCY ASSESSMENT (FOR TECHNICIAN)   MNT 3.14-020
 *   SIMILAR & SIMPLE TASKS
 *     SIMILAR TASK  MNT-1276
 *     SIMPLE TASK   MNT-1341A
 *   TOOLS AND EQUIPMENT
 *     TOOL NEED ANALYSIS REPORT  MNT-1229B
 *     ALTERNATE TOOL EQUIPMENT  ENG-751
 *     IN-HOUSE MANUFACTURING TOOL JIC
 *       TOOL MFG JIC (ETH)  MNT-1563
 *       RISK ASSESSMENT     MNT-1269
 *       TOOL MFG FORM       MNT-1554
 *   FACILITY REQUIREMENT EVALUATION
 *   CONSUMABLES
 *
 * Icons are exposed as components (`Icon`) rather than pre-rendered elements so
 * each consumer can pick its own size while the colour stays consistent.
 */
'use client'

import type { LucideIcon } from 'lucide-react'
import {
  AlertTriangle,
  Beaker,
  ClipboardCheck,
  Cpu,
  Factory,
  FileCheck,
  FileText,
  GraduationCap,
  Hammer,
  Leaf,
  Mail,
  Package,
  Plane,
  Shield,
  ShieldAlert,
  Wrench,
} from 'lucide-react'
import type { FormNodeType } from './types'

/** A single entry in the Table of Contents. */
export interface TocFormNode {
  /** Stable key, always equal to the formType for real forms. */
  id: string
  /** Display label, uppercase for main entries. */
  label: string
  /** Backend FormSubmission.FormType value. */
  formType: FormNodeType
  /** Controlled document number, e.g. "MNT-1325". Rendered as a badge. */
  formNo?: string
  /** Owning role, e.g. "Manager". Informational only. */
  role?: string
  Icon: LucideIcon
  /** Tailwind text colour for the icon. */
  iconClass: string
  /** Nested forms that belong to this entry. */
  children?: TocFormNode[]
}

/** A labelled bucket inside a category (currently only DOCUMENTATION → OTHERS). */
export interface TocSubGroup {
  id: string
  title: string
  forms: TocFormNode[]
}

/** One of the five main Table of Contents categories. */
export interface TocCategory {
  id: string
  title: string
  Icon: LucideIcon
  /** Light theme (DocumentWorkspace right panel). */
  color: string
  bgColor: string
  borderColor: string
  hoverBg: string
  /** Dark theme (HierarchyTree sidebar). */
  sidebarColor: string
  forms: TocFormNode[]
  subGroups?: TocSubGroup[]
}

// ===========================================================================
// 1. Promoted top-level items — rendered BEFORE the categories
// ===========================================================================

export const TOC_TOP_LEVEL_FORMS: TocFormNode[] = [
  {
    id: 'periodic_self_audit',
    label: 'PERIODIC CAPABILITY SELF-AUDIT',
    formType: 'periodic_self_audit',
    formNo: 'MNT-1325',
    Icon: ClipboardCheck,
    iconClass: 'text-blue-500',
  },
  {
    id: 'confirmation_letter',
    label: 'LETTER OF CONFIRMATION',
    formType: 'confirmation_letter',
    role: 'Manager',
    Icon: Mail,
    iconClass: 'text-indigo-500',
  },
  {
    id: 'request_letter',
    label: 'AMENDMENT REQUEST',
    formType: 'request_letter',
    role: 'Director',
    Icon: Mail,
    iconClass: 'text-violet-500',
  },
  {
    id: '918_faa',
    label: '918',
    formType: '918_faa',
    formNo: 'FAA',
    Icon: Plane,
    iconClass: 'text-sky-500',
  },
  {
    id: '918a_caa',
    label: '918 A',
    formType: '918a_caa',
    formNo: 'CAA',
    Icon: Plane,
    iconClass: 'text-teal-500',
  },
]

// ===========================================================================
// 2. The categories
// ===========================================================================

export const TOC_CATEGORIES: TocCategory[] = [
  {
    id: 'documentation',
    title: 'DOCUMENTATION',
    Icon: FileText,
    color: 'text-emerald-700',
    bgColor: 'bg-emerald-50',
    borderColor: 'border-emerald-200',
    hoverBg: 'hover:bg-emerald-100',
    sidebarColor: 'text-emerald-400',
    forms: [
      {
        id: 'capability_self_evaluation',
        label: 'CMM REV. STATUS',
        formType: 'capability_self_evaluation',
        Icon: FileCheck,
        iconClass: 'text-emerald-500',
      },
      {
        id: 'task_card',
        label: 'TASK CARD',
        formType: 'task_card',
        Icon: ClipboardCheck,
        iconClass: 'text-indigo-500',
      },
    ],
    subGroups: [
      {
        id: 'others',
        title: 'OTHERS',
        forms: [
          {
            id: 'sb',
            label: 'SB (SERVICE BULLETINS)',
            formType: 'sb',
            formNo: 'MNT-1420A',
            role: 'Personnel',
            Icon: AlertTriangle,
            iconClass: 'text-amber-500',
          },
          {
            id: 'ad',
            label: 'AD (AIRWORTHINESS DIRECTIVES)',
            formType: 'ad',
            formNo: 'MNT-1420B',
            role: 'Shop Team Leader',
            Icon: AlertTriangle,
            iconClass: 'text-red-500',
          },
        ],
      },
    ],
  },
  {
    id: 'training_document',
    title: 'TRAINING DOCUMENT',
    Icon: GraduationCap,
    color: 'text-purple-700',
    bgColor: 'bg-purple-50',
    borderColor: 'border-purple-200',
    hoverBg: 'hover:bg-purple-100',
    sidebarColor: 'text-purple-400',
    forms: [
      {
        id: 'component_maintenance_training',
        label: 'MAINTENANCE AND GENERIC COURSES',
        formType: 'component_maintenance_training',
        Icon: GraduationCap,
        iconClass: 'text-purple-500',
        children: [
          {
            id: 'training_verification_inspection',
            label: 'TRAINING VERIFICATION (INSPECTION)',
            formType: 'training_verification_inspection',
            role: 'Inspector',
            Icon: Shield,
            iconClass: 'text-blue-500',
          },
          {
            id: 'training_verification_technician',
            label: 'TRAINING VERIFICATION (TECHNICIAN)',
            formType: 'training_verification_technician',
            role: 'Technician',
            Icon: Shield,
            iconClass: 'text-cyan-500',
          },
          {
            id: 'inspector_proficiency',
            label: 'INSPECTION PROFICIENCY (FOR INSPECTION)',
            formType: 'inspector_proficiency',
            formNo: 'MNT-1378',
            role: 'Inspector',
            Icon: Shield,
            iconClass: 'text-blue-600',
          },
          {
            id: 'competency_assessment',
            label: 'COMPETENCY ASSESSMENT (FOR TECHNICIAN)',
            formType: 'competency_assessment',
            formNo: 'MNT 3.14-020',
            role: 'Technician',
            Icon: FileCheck,
            iconClass: 'text-green-500',
          },
        ],
      },
    ],
  },
  {
    id: 'similar_simple_tasks',
    title: 'SIMILAR & SIMPLE TASKS',
    Icon: Cpu,
    color: 'text-orange-700',
    bgColor: 'bg-orange-50',
    borderColor: 'border-orange-200',
    hoverBg: 'hover:bg-orange-100',
    sidebarColor: 'text-orange-400',
    forms: [
      {
        id: 'similar_task',
        label: 'SIMILAR TASK',
        formType: 'similar_task',
        formNo: 'MNT-1276',
        Icon: Cpu,
        iconClass: 'text-orange-500',
      },
      {
        id: 'simple_task',
        label: 'SIMPLE TASK',
        formType: 'simple_task',
        formNo: 'MNT-1341A',
        Icon: Cpu,
        iconClass: 'text-yellow-500',
      },
    ],
  },
  {
    id: 'tools_and_equipment',
    title: 'TOOLS AND EQUIPMENT',
    Icon: Wrench,
    color: 'text-amber-700',
    bgColor: 'bg-amber-50',
    borderColor: 'border-amber-200',
    hoverBg: 'hover:bg-amber-100',
    sidebarColor: 'text-amber-400',
    forms: [
      {
        id: 'tna',
        label: 'TOOL NEED ANALYSIS REPORT',
        formType: 'tna',
        formNo: 'MNT-1229B',
        Icon: Wrench,
        iconClass: 'text-slate-500',
      },
      {
        id: 'alternate_tools_equivalency',
        label: 'ALTERNATE TOOLS EQUIVALENCY',
        formType: 'alternate_tools_equivalency',
        formNo: 'ENG 751',
        role: 'Engineer / Special Team Leader',
        Icon: Wrench,
        iconClass: 'text-amber-600',
      },
      {
        id: 'inhouse_manufactured_tools',
        label: 'IN-HOUSE MANUFACTURING TOOL JIC',
        formType: 'inhouse_manufactured_tools',
        Icon: Factory,
        iconClass: 'text-stone-500',
        children: [
          {
            id: 'tool_mfg_jic',
            label: 'TOOL MFG JIC (ETH)',
            formType: 'tool_mfg_jic',
            formNo: 'MNT-1563',
            Icon: Hammer,
            iconClass: 'text-stone-600',
          },
          {
            id: 'tool_risk_assessment',
            label: 'RISK ASSESSMENT',
            formType: 'tool_risk_assessment',
            formNo: 'MNT-1269',
            Icon: ShieldAlert,
            iconClass: 'text-red-500',
          },
          {
            id: 'tool_mfg_form_1554',
            label: 'TOOL MFG FORM',
            formType: 'tool_mfg_form_1554',
            formNo: 'MNT-1554',
            Icon: FileText,
            iconClass: 'text-stone-500',
          },
        ],
      },
    ],
  },
  {
    id: 'facility_requirement',
    title: 'FACILITY REQUIREMENT EVALUATION',
    Icon: Factory,
    color: 'text-rose-700',
    bgColor: 'bg-rose-50',
    borderColor: 'border-rose-200',
    hoverBg: 'hover:bg-rose-100',
    sidebarColor: 'text-rose-400',
    forms: [
      {
        id: 'repair_facility_evaluation',
        label: 'REPAIR FACILITY REQUIREMENT EVALUATION',
        formType: 'repair_facility_evaluation',
        Icon: Factory,
        iconClass: 'text-rose-500',
      },
      {
        id: 'cleaning_facility_evaluation',
        label: 'CLEANING FACILITY EVALUATION',
        formType: 'cleaning_facility_evaluation',
        Icon: Beaker,
        iconClass: 'text-cyan-500',
      },
      {
        id: 'environmental_facility_evaluation',
        label: 'ENVIRONMENTAL REQUIREMENT AND FACILITY EVALUATION',
        formType: 'environmental_facility_evaluation',
        Icon: Leaf,
        iconClass: 'text-green-500',
      },
    ],
  },
  {
    id: 'consumables',
    title: 'CONSUMABLES',
    Icon: Package,
    color: 'text-blue-700',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
    hoverBg: 'hover:bg-blue-100',
    sidebarColor: 'text-blue-400',
    forms: [
      {
        id: 'list_of_consumables',
        label: 'LIST OF REQUIRED CONSUMABLES',
        formType: 'list_of_consumables',
        Icon: Package,
        iconClass: 'text-pink-500',
      },
      {
        id: 'alternate_consumable_declaration',
        label: 'ALTERNATE CONSUMABLE DECLARATION',
        formType: 'alternate_consumable_declaration',
        Icon: Package,
        iconClass: 'text-fuchsia-500',
      },
    ],
  },
]

// ===========================================================================
// 3. Derived helpers
// ===========================================================================

/** Depth-first flatten of a node list, parents before their children. */
function flattenNodes(nodes: TocFormNode[]): TocFormNode[] {
  return nodes.flatMap(node => [
    node,
    ...(node.children ? flattenNodes(node.children) : []),
  ])
}

/** Every form in the Table of Contents, in render order. */
export const TOC_ALL_FORMS: TocFormNode[] = [
  ...flattenNodes(TOC_TOP_LEVEL_FORMS),
  ...TOC_CATEGORIES.flatMap(category => [
    ...flattenNodes(category.forms),
    ...(category.subGroups?.flatMap(group => flattenNodes(group.forms)) ?? []),
  ]),
]

/** Total number of forms of a category, including nested and sub-group forms. */
export function getCategoryFormCount(category: TocCategory): number {
  const direct = flattenNodes(category.forms).length
  const grouped = category.subGroups?.reduce(
    (total, group) => total + flattenNodes(group.forms).length,
    0,
  ) ?? 0
  return direct + grouped
}

/** Look up a node by its backend form type. */
export function findTocForm(formType: FormNodeType): TocFormNode | undefined {
  return TOC_ALL_FORMS.find(node => node.formType === formType)
}

/** Label including the controlled document number, e.g. "918 (FAA)". */
export function getFormLabel(formType: FormNodeType): string {
  const node = findTocForm(formType)
  if (!node) return formType
  return node.formNo ? `${node.label} (${node.formNo})` : node.label
}

/** Controlled document number only, or an empty string. */
export function getFormNo(formType: FormNodeType): string {
  return findTocForm(formType)?.formNo ?? ''
}

/**
 * The parent of a nested node, used to render "Back to <parent>" navigation.
 */
export function findTocParent(formType: FormNodeType): TocFormNode | undefined {
  return TOC_ALL_FORMS.find(node =>
    node.children?.some(child => child.formType === formType),
  )
}