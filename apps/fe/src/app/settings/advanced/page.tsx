"use client"

import { ApiError, fetchApi } from "@/lib/api"
import {
  API_V1,
  type AdvancedSettingsGetResponse,
  advancedSettingsGetResponseSchema,
} from "@yummy/shared"
import { AlertCircle, CheckCircle2, KeyRound, Loader2 } from "lucide-react"
import { type ComponentProps, useCallback, useEffect, useState } from "react"

type ErrorContext = "load" | "save"

function safeErrorMessage(err: unknown, context: ErrorContext): string {
  if (err instanceof ApiError && err.statusCode === 401) {
    return "Your session expired. Sign in again to update advanced settings."
  }

  if (context === "load") {
    return "Could not load advanced settings. Refresh and try again."
  }

  return "Could not save settings. Check the endpoint URL and try again."
}

// biome-ignore lint/style/noDefaultExport: Next.js App Router requires default export for page
export default function AdvancedSettingsPage() {
  const [hasApiKey, setHasApiKey] = useState(false)
  const [apiKey, setApiKey] = useState("")
  const [endpoint, setEndpoint] = useState("")
  const [selectedModel, setSelectedModel] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const applySettings = useCallback((settings: AdvancedSettingsGetResponse) => {
    setHasApiKey(settings.hasApiKey)
    setEndpoint(settings.endpoint ?? "")
    setSelectedModel(settings.selectedModel)
  }, [])

  const loadSettings = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const settings = await fetchApi(`${API_V1.SETTINGS}/advanced`, {
        schema: advancedSettingsGetResponseSchema,
      })
      applySettings(settings)
      setApiKey("")
    } catch (err: unknown) {
      setError(safeErrorMessage(err, "load"))
    } finally {
      setIsLoading(false)
    }
  }, [applySettings])

  useEffect(() => {
    void loadSettings()
  }, [loadSettings])

  const handleSubmit: NonNullable<ComponentProps<"form">["onSubmit"]> = async (event) => {
    event.preventDefault()
    if (isSaving) return

    setIsSaving(true)
    setError(null)
    setSuccess(null)

    const trimmedApiKey = apiKey.trim()
    const trimmedEndpoint = endpoint.trim()
    const input = {
      ...(trimmedApiKey ? { apiKey: trimmedApiKey } : {}),
      ...(trimmedEndpoint ? { endpoint: trimmedEndpoint } : {}),
    }

    try {
      const settings = await fetchApi(`${API_V1.SETTINGS}/advanced`, {
        method: "PUT",
        body: input,
        schema: advancedSettingsGetResponseSchema,
      })
      applySettings(settings)
      setApiKey("")
      setSuccess("Settings saved")
    } catch (err: unknown) {
      setError(safeErrorMessage(err, "save"))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h2 className="text-[1.5rem] font-semibold leading-[1.3] tracking-[-0.015em] text-text-primary">
          Advanced
        </h2>
      </div>
      <p className="mt-spacing-2 text-[0.8125rem] leading-[1.5] text-text-secondary">
        Bring your own OpenAI-compatible API key and endpoint. Keys are never shown again after
        saving.
      </p>

      {error && (
        <div className="mt-spacing-4 flex items-center gap-spacing-2 rounded-radius-md border border-status-error/20 bg-status-error/5 px-spacing-3 py-spacing-2 text-[0.8125rem] leading-[1.5] text-status-error">
          <AlertCircle size={14} className="shrink-0" />
          {error}
          <button
            type="button"
            onClick={() => {
              setError(null)
              void loadSettings()
            }}
            className="ml-auto text-[0.75rem] font-medium underline"
          >
            Retry
          </button>
        </div>
      )}

      {success && (
        <div className="mt-spacing-4 flex items-center gap-spacing-2 rounded-radius-md border border-status-success/20 bg-status-success/5 px-spacing-3 py-spacing-2 text-[0.8125rem] leading-[1.5] text-status-success">
          <CheckCircle2 size={14} className="shrink-0" />
          {success}
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="mt-spacing-6 rounded-radius-md border border-border-default bg-surface-secondary px-spacing-4 py-spacing-4"
      >
        <div className="flex flex-col gap-spacing-4">
          <div className="flex items-start justify-between gap-spacing-3 rounded-radius-md border border-border-subtle bg-surface-primary px-spacing-3 py-spacing-3">
            <div className="flex min-w-0 items-start gap-spacing-2">
              <KeyRound size={16} className="mt-spacing-half shrink-0 text-accent-secondary" />
              <div className="min-w-0">
                <p className="text-[0.9375rem] font-medium leading-[1.4] text-text-primary">
                  Provider credentials
                </p>
                <p className="mt-spacing-1 text-[0.8125rem] leading-[1.5] text-text-secondary">
                  {selectedModel ? `Selected model: ${selectedModel}` : "No model selected yet."}
                </p>
              </div>
            </div>
            {hasApiKey && (
              <span className="shrink-0 rounded-radius-full border border-status-success/20 bg-status-success/5 px-spacing-2 py-spacing-half text-[0.6875rem] font-medium leading-[1.3] tracking-[0.05em] uppercase text-status-success">
                API key configured
              </span>
            )}
          </div>

          <div>
            <label
              htmlFor="advanced-api-key"
              className="mb-spacing-1 block text-[0.75rem] font-medium leading-[1.4] tracking-[0.05em] uppercase text-text-tertiary"
            >
              API key
            </label>
            <input
              id="advanced-api-key"
              type="password"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder="sk-..."
              autoComplete="off"
              disabled={isLoading || isSaving}
              className="w-full rounded-radius-sm border border-border-subtle bg-surface-primary px-spacing-3 py-spacing-2 text-[0.9375rem] leading-[1.6] text-text-primary placeholder:text-text-tertiary focus:border-border-accent focus:outline-none disabled:opacity-40"
            />
            <p className="mt-spacing-1 text-[0.75rem] leading-[1.4] text-text-tertiary">
              Leave blank to keep the currently configured key.
            </p>
          </div>

          <div>
            <label
              htmlFor="advanced-endpoint"
              className="mb-spacing-1 block text-[0.75rem] font-medium leading-[1.4] tracking-[0.05em] uppercase text-text-tertiary"
            >
              Endpoint URL
            </label>
            <input
              id="advanced-endpoint"
              type="url"
              value={endpoint}
              onChange={(event) => setEndpoint(event.target.value)}
              placeholder="https://api.openai.com/v1"
              disabled={isLoading || isSaving}
              className="w-full rounded-radius-sm border border-border-subtle bg-surface-primary px-spacing-3 py-spacing-2 text-[0.9375rem] leading-[1.6] text-text-primary placeholder:text-text-tertiary focus:border-border-accent focus:outline-none disabled:opacity-40"
            />
          </div>

          <div className="flex items-center justify-end gap-spacing-2">
            <button
              type="submit"
              disabled={isLoading || isSaving}
              className="flex items-center gap-spacing-2 rounded-radius-md bg-accent-primary px-spacing-4 py-spacing-2 text-[0.8125rem] font-medium leading-[1.5] text-text-inverse transition-[transform,opacity] duration-[100ms] ease-in-out hover:opacity-90 active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none"
            >
              {isSaving && <Loader2 size={14} className="animate-spin" />}
              {isSaving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
