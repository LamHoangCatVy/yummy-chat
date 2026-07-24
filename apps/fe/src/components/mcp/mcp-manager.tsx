"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import {
  ApiError,
  createMcpServer,
  deleteMcpServer,
  disconnectMcpOauth,
  listMcpServers,
  listMcpTools,
  startMcpOauth,
  updateMcpServer,
} from "@/lib/api"
import type {
  McpArgument,
  McpArgumentInput,
  McpConnectionInput,
  McpNamedValue,
  McpNamedValueInput,
  McpServer,
  McpTool,
} from "@yummy/shared"
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Edit3,
  Loader2,
  LogIn,
  LogOut,
  Plus,
  RefreshCw,
  Server,
  Trash2,
  Wrench,
  X,
} from "lucide-react"
import { useSearchParams } from "next/navigation"
import { type FormEvent, useCallback, useEffect, useState } from "react"

type ConnectionType = McpConnectionInput["type"]

interface NamedDraft {
  readonly id?: string
  readonly hasValue?: boolean
  name: string
  value: string
  secret: boolean
}

interface ArgumentDraft {
  readonly id?: string
  readonly hasValue?: boolean
  value: string
  secret: boolean
}

interface FormState {
  name: string
  type: ConnectionType
  url: string
  grantType: "authorization_code" | "client_credentials"
  registrationMode: "dynamic" | "manual"
  scopes: string
  clientId: string
  clientSecret: string
  headers: NamedDraft[]
  query: NamedDraft[]
  command: string
  args: ArgumentDraft[]
  env: NamedDraft[]
  cwd: string
}

const EMPTY_FORM: FormState = {
  name: "",
  type: "remote_custom",
  url: "",
  grantType: "authorization_code",
  registrationMode: "dynamic",
  scopes: "",
  clientId: "",
  clientSecret: "",
  headers: [],
  query: [],
  command: "",
  args: [],
  env: [],
  cwd: "",
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message
  return "Something went wrong. Try again."
}

function namedDraft(entry: McpNamedValue): NamedDraft {
  return {
    id: entry.id,
    name: entry.name,
    value: entry.value ?? "",
    secret: entry.secret,
    hasValue: entry.hasValue,
  }
}

function argumentDraft(entry: McpArgument): ArgumentDraft {
  return {
    id: entry.id,
    value: entry.value ?? "",
    secret: entry.secret,
    hasValue: entry.hasValue,
  }
}

function formFromServer(server: McpServer): FormState {
  const connection = server.connection
  if (connection.type === "remote_oauth") {
    return {
      ...EMPTY_FORM,
      name: server.name,
      type: connection.type,
      url: connection.url,
      grantType: connection.grantType,
      registrationMode: connection.registrationMode,
      scopes: connection.scopes.join(" "),
      clientId: connection.clientId ?? "",
    }
  }
  if (connection.type === "local_stdio") {
    return {
      ...EMPTY_FORM,
      name: server.name,
      type: connection.type,
      command: connection.command,
      args: connection.args.map(argumentDraft),
      env: connection.env.map(namedDraft),
      cwd: connection.cwd ?? "",
    }
  }
  return {
    ...EMPTY_FORM,
    name: server.name,
    type: connection.type,
    url: connection.url,
    headers: connection.headers.map(namedDraft),
    query: connection.query.map(namedDraft),
  }
}

function namedInput(entry: NamedDraft): McpNamedValueInput {
  return {
    ...(entry.id ? { id: entry.id } : {}),
    name: entry.name.trim(),
    secret: entry.secret,
    ...(entry.value !== "" || !entry.hasValue ? { value: entry.value } : {}),
  }
}

function argumentInput(entry: ArgumentDraft): McpArgumentInput {
  return {
    ...(entry.id ? { id: entry.id } : {}),
    secret: entry.secret,
    ...(entry.value !== "" || !entry.hasValue ? { value: entry.value } : {}),
  }
}

function connectionInput(form: FormState): McpConnectionInput {
  if (form.type === "remote_oauth") {
    const scopes = form.scopes
      .split(/[\s,]+/)
      .map((scope) => scope.trim())
      .filter(Boolean)
    return {
      type: form.type,
      url: form.url.trim(),
      grantType: form.grantType,
      scopes,
      registrationMode: form.grantType === "client_credentials" ? "manual" : form.registrationMode,
      ...(form.clientId.trim() ? { clientId: form.clientId.trim() } : {}),
      ...(form.clientSecret ? { clientSecret: form.clientSecret } : {}),
    }
  }
  if (form.type === "local_stdio") {
    return {
      type: form.type,
      command: form.command.trim(),
      args: form.args.map(argumentInput),
      env: form.env.map(namedInput),
      ...(form.cwd.trim() ? { cwd: form.cwd.trim() } : {}),
    }
  }
  return {
    type: form.type,
    url: form.url.trim(),
    headers: form.headers.map(namedInput),
    query: form.query.map(namedInput),
  }
}

export function McpManager() {
  const searchParams = useSearchParams()
  const [servers, setServers] = useState<readonly McpServer[]>([])
  const [tools, setTools] = useState<Record<string, readonly McpTool[]>>({})
  const [localStdioEnabled, setLocalStdioEnabled] = useState(false)
  const [loadingTools, setLoadingTools] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [busyOauthId, setBusyOauthId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)

  const loadServers = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const response = await listMcpServers()
      setServers(response.servers)
      setLocalStdioEnabled(response.capabilities.localStdioEnabled)
    } catch (loadError) {
      setError(errorMessage(loadError))
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadServers()
  }, [loadServers])

  useEffect(() => {
    const oauthStatus = searchParams.get("mcpOauth")
    if (oauthStatus === "success") setSuccess("OAuth authorization completed")
    if (oauthStatus === "error") setError("OAuth authorization could not be completed")
  }, [searchParams])

  const closeForm = () => {
    setForm(EMPTY_FORM)
    setEditingId(null)
    setIsFormOpen(false)
  }

  const openAdd = () => {
    setForm(EMPTY_FORM)
    setEditingId(null)
    setIsFormOpen(true)
  }

  const openEdit = (server: McpServer) => {
    setForm(formFromServer(server))
    setEditingId(server.id)
    setIsFormOpen(true)
  }

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (isSaving) return
    setIsSaving(true)
    setError(null)
    try {
      const input = { name: form.name.trim(), connection: connectionInput(form), enabled: true }
      const saved = editingId
        ? await updateMcpServer(editingId, { name: input.name, connection: input.connection })
        : await createMcpServer(input)
      setServers((current) =>
        editingId
          ? current.map((item) => (item.id === saved.id ? saved : item))
          : [saved, ...current],
      )
      setSuccess(editingId ? "MCP server updated" : "MCP server added")
      closeForm()
    } catch (saveError) {
      setError(errorMessage(saveError))
    } finally {
      setIsSaving(false)
    }
  }

  const handleToggle = async (server: McpServer) => {
    setError(null)
    try {
      const updated = await updateMcpServer(server.id, { enabled: !server.enabled })
      setServers((current) => current.map((item) => (item.id === updated.id ? updated : item)))
    } catch (toggleError) {
      setError(errorMessage(toggleError))
    }
  }

  const handleDelete = async (server: McpServer) => {
    if (!window.confirm(`Delete ${server.name}?`)) return
    setError(null)
    try {
      await deleteMcpServer(server.id)
      setServers((current) => current.filter((item) => item.id !== server.id))
      if (expandedId === server.id) setExpandedId(null)
      if (editingId === server.id) closeForm()
    } catch (deleteError) {
      setError(errorMessage(deleteError))
    }
  }

  const handleTools = async (server: McpServer) => {
    if (expandedId === server.id) {
      setExpandedId(null)
      return
    }
    setExpandedId(server.id)
    setLoadingTools(server.id)
    setError(null)
    try {
      const response = await listMcpTools(server.id)
      setTools((current) => ({ ...current, [server.id]: response.tools }))
      setServers((current) =>
        current.map((item) => (item.id === response.server.id ? response.server : item)),
      )
    } catch (toolError) {
      setTools((current) => ({ ...current, [server.id]: [] }))
      setError(errorMessage(toolError))
    } finally {
      setLoadingTools(null)
    }
  }

  const handleOauthConnect = async (server: McpServer) => {
    setBusyOauthId(server.id)
    setError(null)
    try {
      const response = await startMcpOauth(server.id)
      window.location.assign(response.authorizationUrl)
    } catch (oauthError) {
      setError(errorMessage(oauthError))
      setBusyOauthId(null)
    }
  }

  const handleOauthDisconnect = async (server: McpServer) => {
    setBusyOauthId(server.id)
    setError(null)
    try {
      const updated = await disconnectMcpOauth(server.id)
      setServers((current) => current.map((item) => (item.id === updated.id ? updated : item)))
      setSuccess("OAuth credentials cleared")
    } catch (oauthError) {
      setError(errorMessage(oauthError))
    } finally {
      setBusyOauthId(null)
    }
  }

  return (
    <div>
      <div className="flex items-start justify-between gap-spacing-4">
        <div>
          <h2 className="text-[1.5rem] font-semibold leading-[1.3] tracking-[-0.015em] text-text-primary">
            MCP
          </h2>
          <p className="mt-spacing-2 text-[0.8125rem] leading-[1.5] text-text-secondary">
            Connect OAuth or custom HTTP servers, or launch local stdio servers. Enabled tools are
            available in every chat.
          </p>
        </div>
        <button
          type="button"
          onClick={openAdd}
          className="flex shrink-0 items-center gap-spacing-2 rounded-radius-md bg-accent-primary px-spacing-3 py-spacing-2 text-[0.8125rem] font-medium text-text-inverse hover:opacity-90"
        >
          <Plus size={15} /> Add server
        </button>
      </div>

      {success && <Notice kind="success" message={success} onClose={() => setSuccess(null)} />}
      {error && <Notice kind="error" message={error} onClose={() => setError(null)} />}

      {isFormOpen && (
        <McpForm
          form={form}
          setForm={setForm}
          editing={Boolean(editingId)}
          localStdioEnabled={localStdioEnabled}
          saving={isSaving}
          onSubmit={handleSave}
          onClose={closeForm}
        />
      )}

      <div className="mt-spacing-6 space-y-spacing-3">
        {isLoading && (
          <div className="flex justify-center py-spacing-10">
            <Loader2 size={22} className="animate-spin text-text-tertiary" />
          </div>
        )}
        {!isLoading && servers.length === 0 && (
          <div className="rounded-radius-md border border-dashed border-border-default px-spacing-6 py-spacing-10 text-center">
            <Server size={24} className="mx-auto text-text-tertiary" />
            <p className="mt-spacing-2 text-[0.875rem] font-medium text-text-primary">
              No MCP servers
            </p>
            <p className="mt-spacing-1 text-[0.8125rem] text-text-secondary">
              Add an OAuth, custom HTTP, or local stdio connection.
            </p>
          </div>
        )}
        {servers.map((server) => (
          <ServerCard
            key={server.id}
            server={server}
            tools={tools[server.id] ?? []}
            expanded={expandedId === server.id}
            loadingTools={loadingTools === server.id}
            busyOauth={busyOauthId === server.id}
            onToggle={() => void handleToggle(server)}
            onEdit={() => openEdit(server)}
            onDelete={() => void handleDelete(server)}
            onTools={() => void handleTools(server)}
            onOauthConnect={() => void handleOauthConnect(server)}
            onOauthDisconnect={() => void handleOauthDisconnect(server)}
          />
        ))}
      </div>
    </div>
  )
}

function McpForm({
  form,
  setForm,
  editing,
  localStdioEnabled,
  saving,
  onSubmit,
  onClose,
}: {
  readonly form: FormState
  readonly setForm: (next: FormState | ((current: FormState) => FormState)) => void
  readonly editing: boolean
  readonly localStdioEnabled: boolean
  readonly saving: boolean
  readonly onSubmit: (event: FormEvent<HTMLFormElement>) => void
  readonly onClose: () => void
}) {
  const update = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }))
  return (
    <Card className="mt-spacing-5 p-spacing-4">
      <CardHeader>
        <h3 className="text-[0.9375rem] font-semibold text-text-primary">
          {editing ? "Edit MCP server" : "Add MCP server"}
        </h3>
        <Button
          onClick={onClose}
          aria-label="Close form"
          variant="ghost"
          size="icon"
          className="text-text-tertiary"
        >
          <X size={16} />
        </Button>
      </CardHeader>
      <CardContent className="mt-spacing-4">
        <form id="mcp-server-form" onSubmit={onSubmit} className="grid gap-spacing-4">
          <Field label="Name" id="mcp-name">
            <Input
              id="mcp-name"
              required
              maxLength={100}
              value={form.name}
              onChange={(event) => update("name", event.target.value)}
              placeholder="Company tools"
            />
          </Field>
          <Field label="Connection type" id="mcp-type">
            <Select
              value={form.type}
              onValueChange={(value) => update("type", value as ConnectionType)}
            >
              <SelectTrigger id="mcp-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="remote_oauth">Remote with OAuth</SelectItem>
                <SelectItem value="remote_custom">Remote with custom arguments</SelectItem>
                <SelectItem value="local_stdio" disabled={!localStdioEnabled}>
                  Local stdio with custom arguments
                </SelectItem>
              </SelectContent>
            </Select>
            {!localStdioEnabled && (
              <p className="mt-spacing-1 text-[0.75rem] text-text-tertiary">
                Set MCP_ALLOW_LOCAL_COMMANDS=true to enable local commands.
              </p>
            )}
          </Field>

          {form.type === "remote_oauth" && <OAuthFields form={form} update={update} />}
          {form.type === "remote_custom" && (
            <>
              <UrlField value={form.url} onChange={(value) => update("url", value)} />
              <NamedRows
                label="Headers"
                entries={form.headers}
                onChange={(entries) => update("headers", entries)}
                namePlaceholder="Authorization"
              />
              <NamedRows
                label="Query parameters"
                entries={form.query}
                onChange={(entries) => update("query", entries)}
                namePlaceholder="tenant"
              />
            </>
          )}
          {form.type === "local_stdio" && (
            <>
              <Field label="Command" id="mcp-command">
                <Input
                  id="mcp-command"
                  required
                  value={form.command}
                  onChange={(event) => update("command", event.target.value)}
                  placeholder="npx"
                />
              </Field>
              <ArgumentRows entries={form.args} onChange={(entries) => update("args", entries)} />
              <NamedRows
                label="Environment variables"
                entries={form.env}
                onChange={(entries) => update("env", entries)}
                namePlaceholder="API_KEY"
              />
              <Field label="Working directory (optional)" id="mcp-cwd">
                <Input
                  id="mcp-cwd"
                  value={form.cwd}
                  onChange={(event) => update("cwd", event.target.value)}
                  placeholder="/workspace/project"
                />
              </Field>
              <p className="rounded-radius-sm bg-status-error/5 px-spacing-3 py-spacing-2 text-[0.75rem] text-status-error">
                This command runs with the backend service account's file and network permissions.
              </p>
            </>
          )}
        </form>
      </CardContent>
      <CardFooter className="mt-spacing-4 justify-end gap-spacing-2">
        <Button onClick={onClose} variant="ghost">
          Cancel
        </Button>
        <Button type="submit" form="mcp-server-form" disabled={saving}>
          {saving && <Loader2 size={14} className="animate-spin" />}
          {saving ? "Saving..." : editing ? "Save changes" : "Add server"}
        </Button>
      </CardFooter>
    </Card>
  )
}

function OAuthFields({
  form,
  update,
}: {
  readonly form: FormState
  readonly update: <K extends keyof FormState>(key: K, value: FormState[K]) => void
}) {
  const manual = form.grantType === "client_credentials" || form.registrationMode === "manual"
  return (
    <>
      <UrlField value={form.url} onChange={(value) => update("url", value)} />
      <Field label="OAuth grant" id="mcp-grant">
        <Select
          value={form.grantType}
          onValueChange={(value) => update("grantType", value as FormState["grantType"])}
        >
          <SelectTrigger id="mcp-grant">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="authorization_code">Authorization code + PKCE</SelectItem>
            <SelectItem value="client_credentials">Client credentials</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      {form.grantType === "authorization_code" && (
        <Field label="Client registration" id="mcp-registration">
          <Select
            value={form.registrationMode}
            onValueChange={(value) =>
              update("registrationMode", value as FormState["registrationMode"])
            }
          >
            <SelectTrigger id="mcp-registration">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="dynamic">Automatic discovery and registration</SelectItem>
              <SelectItem value="manual">Use a pre-registered client</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      )}
      {manual && (
        <Field label="Client ID" id="mcp-client-id">
          <Input
            id="mcp-client-id"
            required
            value={form.clientId}
            onChange={(event) => update("clientId", event.target.value)}
          />
        </Field>
      )}
      {manual && (
        <Field label="Client secret" id="mcp-client-secret">
          <Input
            id="mcp-client-secret"
            type="password"
            autoComplete="off"
            value={form.clientSecret}
            onChange={(event) => update("clientSecret", event.target.value)}
            placeholder="Leave blank to keep the saved secret"
          />
        </Field>
      )}
      <Field label="Scopes (space or comma separated)" id="mcp-scopes">
        <Input
          id="mcp-scopes"
          value={form.scopes}
          onChange={(event) => update("scopes", event.target.value)}
          placeholder="openid profile tools.read"
        />
      </Field>
    </>
  )
}

function UrlField({
  value,
  onChange,
}: { readonly value: string; readonly onChange: (value: string) => void }) {
  return (
    <Field label="Server URL" id="mcp-url">
      <Input
        id="mcp-url"
        required
        type="url"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="https://mcp.example.com/mcp"
      />
    </Field>
  )
}

function NamedRows({
  label,
  entries,
  onChange,
  namePlaceholder,
}: {
  readonly label: string
  readonly entries: NamedDraft[]
  readonly onChange: (entries: NamedDraft[]) => void
  readonly namePlaceholder: string
}) {
  const update = (index: number, patch: Partial<NamedDraft>) =>
    onChange(
      entries.map((entry, entryIndex) => (entryIndex === index ? { ...entry, ...patch } : entry)),
    )
  return (
    <fieldset className="relative">
      <legend className="text-[0.8125rem] font-medium text-text-primary">{label}</legend>
      <Button
        onClick={() => onChange([...entries, { name: "", value: "", secret: false }])}
        variant="ghost"
        size="sm"
        className="absolute top-0 right-0 h-auto px-0 py-0 text-[0.75rem] text-accent-primary hover:bg-transparent"
      >
        + Add
      </Button>
      <div className="mt-spacing-2 space-y-spacing-2">
        {entries.map((entry, index) => (
          <div
            key={entry.id ?? `new-${index}`}
            className="grid grid-cols-[1fr_1fr_auto_auto] gap-spacing-2"
          >
            <Input
              aria-label={`${label} name`}
              required
              value={entry.name}
              onChange={(event) => update(index, { name: event.target.value })}
              placeholder={namePlaceholder}
            />
            <Input
              aria-label={`${label} value`}
              type={entry.secret ? "password" : "text"}
              value={entry.value}
              onChange={(event) => update(index, { value: event.target.value })}
              placeholder={entry.hasValue ? "Saved — leave blank to keep" : "Value"}
            />
            <Label className="gap-spacing-1 text-[0.75rem] font-normal text-text-secondary">
              <Checkbox
                checked={entry.secret}
                onCheckedChange={(checked) => update(index, { secret: checked === true })}
              />
              Secret
            </Label>
            <Button
              aria-label={`Remove ${label} row`}
              onClick={() => onChange(entries.filter((_, entryIndex) => entryIndex !== index))}
              variant="ghost"
              size="icon"
              className="text-text-tertiary hover:text-status-error"
            >
              <X size={15} />
            </Button>
          </div>
        ))}
      </div>
    </fieldset>
  )
}

function ArgumentRows({
  entries,
  onChange,
}: { readonly entries: ArgumentDraft[]; readonly onChange: (entries: ArgumentDraft[]) => void }) {
  const update = (index: number, patch: Partial<ArgumentDraft>) =>
    onChange(
      entries.map((entry, entryIndex) => (entryIndex === index ? { ...entry, ...patch } : entry)),
    )
  return (
    <fieldset className="relative">
      <legend className="text-[0.8125rem] font-medium text-text-primary">
        Arguments (in order)
      </legend>
      <Button
        onClick={() => onChange([...entries, { value: "", secret: false }])}
        variant="ghost"
        size="sm"
        className="absolute top-0 right-0 h-auto px-0 py-0 text-[0.75rem] text-accent-primary hover:bg-transparent"
      >
        + Add
      </Button>
      <div className="mt-spacing-2 space-y-spacing-2">
        {entries.map((entry, index) => (
          <div
            key={entry.id ?? `new-${index}`}
            className="grid grid-cols-[1fr_auto_auto] gap-spacing-2"
          >
            <Input
              aria-label={`Argument ${index + 1}`}
              value={entry.value}
              onChange={(event) => update(index, { value: event.target.value })}
              type={entry.secret ? "password" : "text"}
              placeholder={entry.hasValue ? "Saved — leave blank to keep" : "Argument"}
            />
            <Label className="gap-spacing-1 text-[0.75rem] font-normal text-text-secondary">
              <Checkbox
                checked={entry.secret}
                onCheckedChange={(checked) => update(index, { secret: checked === true })}
              />
              Secret
            </Label>
            <Button
              aria-label={`Remove argument ${index + 1}`}
              onClick={() => onChange(entries.filter((_, entryIndex) => entryIndex !== index))}
              variant="ghost"
              size="icon"
              className="text-text-tertiary hover:text-status-error"
            >
              <X size={15} />
            </Button>
          </div>
        ))}
      </div>
    </fieldset>
  )
}

function ServerCard({
  server,
  tools,
  expanded,
  loadingTools,
  busyOauth,
  onToggle,
  onEdit,
  onDelete,
  onTools,
  onOauthConnect,
  onOauthDisconnect,
}: {
  readonly server: McpServer
  readonly tools: readonly McpTool[]
  readonly expanded: boolean
  readonly loadingTools: boolean
  readonly busyOauth: boolean
  readonly onToggle: () => void
  readonly onEdit: () => void
  readonly onDelete: () => void
  readonly onTools: () => void
  readonly onOauthConnect: () => void
  readonly onOauthDisconnect: () => void
}) {
  const connection = server.connection
  const subtitle = connection.type === "local_stdio" ? connection.command : connection.url
  const typeLabel =
    connection.type === "remote_oauth"
      ? "OAuth"
      : connection.type === "remote_custom"
        ? "HTTP"
        : "Local"
  const interactiveOauth =
    connection.type === "remote_oauth" && connection.grantType === "authorization_code"
  return (
    <div className="rounded-radius-md border border-border-default bg-surface-secondary">
      <div className="flex items-center gap-spacing-3 p-spacing-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-radius-md bg-surface-tertiary text-text-secondary">
          <Server size={17} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-spacing-2">
            <p className="truncate text-[0.9375rem] font-medium text-text-primary">{server.name}</p>
            <span className="text-[0.6875rem] uppercase tracking-[0.05em] text-text-tertiary">
              {typeLabel}
            </span>
            {connection.type === "remote_oauth" && (
              <span className="text-[0.6875rem] text-text-tertiary">
                {connection.authorizationStatus === "ready" ? "Ready" : "Authorization required"}
              </span>
            )}
          </div>
          <p className="truncate text-[0.75rem] text-text-tertiary">{subtitle}</p>
        </div>
        {interactiveOauth &&
          (connection.authorizationStatus === "ready" ? (
            <button
              type="button"
              disabled={busyOauth}
              onClick={onOauthDisconnect}
              aria-label={`Disconnect OAuth for ${server.name}`}
              className="flex h-8 items-center gap-spacing-1 rounded-radius-sm px-spacing-2 text-[0.75rem] text-text-secondary hover:bg-surface-tertiary"
            >
              <LogOut size={14} /> Disconnect
            </button>
          ) : (
            <button
              type="button"
              disabled={busyOauth}
              onClick={onOauthConnect}
              className="flex h-8 items-center gap-spacing-1 rounded-radius-sm px-spacing-2 text-[0.75rem] text-accent-primary hover:bg-surface-tertiary"
            >
              {busyOauth ? <Loader2 size={14} className="animate-spin" /> : <LogIn size={14} />}{" "}
              Connect
            </button>
          ))}
        <Switch
          checked={server.enabled}
          aria-label={`${server.enabled ? "Disable" : "Enable"} ${server.name}`}
          onCheckedChange={onToggle}
        />
        <button
          type="button"
          onClick={onEdit}
          aria-label={`Edit ${server.name}`}
          className="flex h-8 w-8 items-center justify-center rounded-radius-sm text-text-tertiary hover:bg-surface-tertiary hover:text-text-primary"
        >
          <Edit3 size={15} />
        </button>
        <button
          type="button"
          onClick={onDelete}
          aria-label={`Delete ${server.name}`}
          className="flex h-8 w-8 items-center justify-center rounded-radius-sm text-text-tertiary hover:bg-surface-tertiary hover:text-status-error"
        >
          <Trash2 size={15} />
        </button>
      </div>
      <button
        type="button"
        onClick={onTools}
        className="flex w-full items-center gap-spacing-2 border-t border-border-subtle px-spacing-4 py-spacing-2 text-left text-[0.8125rem] text-text-secondary hover:bg-surface-tertiary"
      >
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <Wrench size={14} />
        Discover tools{loadingTools && <Loader2 size={13} className="ml-auto animate-spin" />}
        {expanded && !loadingTools && <RefreshCw size={13} className="ml-auto" />}
      </button>
      {expanded && (
        <div className="border-t border-border-subtle px-spacing-4 py-spacing-3">
          {loadingTools ? (
            <p className="text-[0.8125rem] text-text-tertiary">Connecting...</p>
          ) : tools.length > 0 ? (
            <div className="space-y-spacing-2">
              {tools.map((tool) => (
                <div
                  key={tool.name}
                  className="flex items-start gap-spacing-2 rounded-radius-sm bg-surface-primary px-spacing-3 py-spacing-2"
                >
                  <CheckCircle2
                    size={14}
                    className="mt-spacing-half shrink-0 text-status-success"
                  />
                  <div>
                    <p className="font-mono text-[0.75rem] font-medium text-text-primary">
                      {tool.name}
                    </p>
                    {tool.description && (
                      <p className="mt-spacing-half text-[0.75rem] text-text-secondary">
                        {tool.description}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[0.8125rem] text-text-tertiary">
              No tools found, or the server could not be reached.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function Notice({
  kind,
  message,
  onClose,
}: { readonly kind: "success" | "error"; readonly message: string; readonly onClose: () => void }) {
  const Icon = kind === "success" ? CheckCircle2 : AlertCircle
  return (
    <div
      className={`mt-spacing-4 flex items-center gap-spacing-2 rounded-radius-md border px-spacing-3 py-spacing-2 text-[0.8125rem] ${kind === "success" ? "border-status-success/20 bg-status-success/5 text-status-success" : "border-status-error/20 bg-status-error/5 text-status-error"}`}
    >
      <Icon size={14} className="shrink-0" />
      <span>{message}</span>
      <button type="button" onClick={onClose} className="ml-auto" aria-label="Dismiss message">
        <X size={14} />
      </button>
    </div>
  )
}

function Field({
  label,
  id,
  children,
}: { readonly label: string; readonly id: string; readonly children: React.ReactNode }) {
  return (
    <div>
      <Label
        htmlFor={id}
        className="mb-spacing-1 block text-[0.8125rem] font-medium text-text-primary"
      >
        {label}
      </Label>
      {children}
    </div>
  )
}
