/**
 * Cleaning Facility Evaluation Form
 * 
 * AMENDED: Now properly uses RepairFacilityEvaluationForm with correct formType prop
 * so that useFormData loads/saves to the correct backend form type.
 */
'use client'

import RepairFacilityEvaluationForm from './RepairFacilityEvaluationForm'

export default function CleaningFacilityEvaluationForm() {
  return (
    <RepairFacilityEvaluationForm
      formType="cleaning_facility_evaluation"
      title="CLEANING FACILITY EVALUATION"
    />
  )
}