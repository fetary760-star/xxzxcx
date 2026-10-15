/**
 * SIMILAR TECHNICAL OR SIMPLE TASKS — GROUP COVER SHEET
 * Table of Contents node: TRAINING DOCUMENT → SIMILAR TECHNICAL OR SIMPLE TASKS
 * (AMENDED v19 — gap-analysis §S-1 / §S-3)
 *
 * WHY THIS FILE CHANGED
 * ---------------------
 * The previous version of this component rendered five INVENTED textareas
 * ("Evaluation Criteria", "Existing Capability", "Proposed Capability",
 * "Similarity Justification", "Evaluated/Approved By") and was also (mis)used
 * for the `similar_task` and `simple_task` child nodes, which have their own
 * controlled paper forms:
 *
 *   - SIMILAR TASK  → MNT-1276  → SimilarTaskEvaluationForm.tsx
 *   - SIMPLE TASK   → MNT-1341A → SimpleTaskEvaluationForm.tsx
 *
 * The paper package contains NO sheet for this parent node itself, so — as
 * recommended in the gap analysis (§S-3, option a) — it is now a GROUP HEADER
 * only: this cover sheet explains the grouping and points to the two child
 * forms. It creates no form submission and prints no invented fields.
 */
'use client'

import { Card, CardContent } from '@/components/ui/card'
import { DocumentHeader } from './FormDocumentChrome'

interface ChildEntry {
  /** Table of Contents label of the child node. */
  node: string
  formNo: string
  title: string
  summary: string
}

/** The two controlled child forms defined by the paper package. */
const CHILD_FORMS: ChildEntry[] = [
  {
    node: 'SIMILAR TASK',
    formNo: 'MNT-1276',
    title: 'SIMILAR TECHNOLOGY EVALUATION CRITERIA',
    summary:
      'Two-page, seven-column similarity evaluation (L/N · CMM SECTION · CRITERIA · EVALUATION WEIGHT · TRAINED COMPONENT EVALUATION · EVALUATED COMPONENT EVALUATION · EVALUATION RESULT), Accepted/Rejected verdict and the Shop Team Leader / Shops Manager / CMT Eng’g Support Team Leader signature block.',
  },
  {
    node: 'SIMPLE TASK',
    formNo: 'MNT-1341A',
    title: 'SIMPLE TASK COMPONENT EVALUATION FORM (Avionics Aircraft Components)',
    summary:
      'Seven controlled YES/NO/N/A criteria rows across the six CMM sections, maintenance description, categorization note, Accepted/Rejected verdict, confirmation statement and the Team Leader / Mgr. Avionics Component Shops / TL Component Engineering support signature block.',
  },
]

export default function SimilarTechnologyForm() {
  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-3 space-y-0">
          <DocumentHeader
            organisation="ETHIOPIAN MRO"
            title="SIMILAR TECHNICAL OR SIMPLE TASKS"
            meta={[{ label: 'Section:', value: 'TRAINING DOCUMENT' }]}
          />

          <div className="border border-gray-400 border-t-0 px-3 py-3">
            <p className="text-[11px] leading-relaxed text-gray-800">
              This node groups the two controlled component-evaluation forms of the
              Training Document package. It has no printed sheet of its own — open one
              of the child forms below to record an evaluation.
            </p>
          </div>

          <div className="space-y-2 pt-3">
            {CHILD_FORMS.map(child => (
              <div key={child.formNo} className="border border-gray-400">
                <div className="flex flex-wrap items-baseline gap-x-3 border-b border-gray-300 bg-gray-100 px-2 py-1.5">
                  <p className="text-[11px] font-bold uppercase text-gray-900">{child.node}</p>
                  <p className="text-[10px] font-semibold text-gray-700">Form No. {child.formNo}</p>
                </div>
                <div className="px-2 py-2">
                  <p className="text-[11px] font-semibold uppercase text-gray-900">{child.title}</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-gray-700">{child.summary}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
