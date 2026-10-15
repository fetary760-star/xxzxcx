'use client'

import { createContext, useContext } from 'react'

type FormUploadStatusContextValue = (hasFiles: boolean) => void

const FormUploadStatusContext = createContext<FormUploadStatusContextValue | null>(null)

export const FormUploadStatusProvider = FormUploadStatusContext.Provider

export function useFormUploadStatus() {
  return useContext(FormUploadStatusContext)
}