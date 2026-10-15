/**
 * Environmental Requirement and Facility Evaluation Form
 * 
 * AMENDED: Now properly uses RepairFacilityEvaluationForm with correct formType prop
 * so that useFormData loads/saves to the correct backend form type.
 */
'use client'

import RepairFacilityEvaluationForm from './RepairFacilityEvaluationForm'

export default function EnvironmentalFacilityEvaluationForm() {
  return (
    <RepairFacilityEvaluationForm
      formType="environmental_facility_evaluation"
      title="ENVIRONMENTAL REQUIREMENT AND FACILITY EVALUATION"
    />
  )
}