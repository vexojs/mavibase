/**
 * Mavibase External Testing Example
 * 
 * This file demonstrates how to filter todos by a specific user
 * using the Mavibase API from an external React/Next.js application.
 * 
 * Copy this file to your external project and update the configuration.
 */

// ============================================================================
// CONFIGURATION - Update these values for your project
// ============================================================================

const MAVIBASE_CONFIG = {
  // Your Mavibase API endpoint
  endpoint: "https://your-mavibase-instance.com/api/v1/db",
  
  // Your API key (get from Mavibase dashboard)
  apiKey: "mk_your_api_key_here",
  
  // Your database and collection IDs
  databaseId: "my-db",           // Your database name/ID
  collectionId: "todos",          // Your collection name/ID
}

// ============================================================================
// TYPES
// ============================================================================

interface Todo {
  $id: string
  $collection_id: string
  $database_id: string
  $created_at: string
  $updated_at: string
  $version: number
  $permissions: Record<string, string[]>
  
  // Your todo fields
  title: string
  completed: boolean
  userId: string              // <-- The field we'll filter by
  description?: string
  dueDate?: string
}

interface MavibaseResponse<T> {
  success: boolean
  message: string
  data: T
  pagination?: {
    total: number
    limit: number
    offset: number
    hasMore: boolean
  }
}

// ============================================================================
// MAVIBASE CLIENT
// ============================================================================

class MavibaseClient {
  private endpoint: string
  private apiKey: string
  private databaseId: string

  constructor(config: typeof MAVIBASE_CONFIG) {
    this.endpoint = config.endpoint
    this.apiKey = config.apiKey
    this.databaseId = config.databaseId
  }

  private async request<T>(
    method: string,
    path: string,
    body?: Record<string, unknown>,
    queryParams?: Record<string, string>
  ): Promise<MavibaseResponse<T>> {
    const url = new URL(`${this.endpoint}${path}`)
    
    if (queryParams) {
      Object.entries(queryParams).forEach(([key, value]) => {
        url.searchParams.append(key, value)
      })
    }

    const response = await fetch(url.toString(), {
      method,
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": this.apiKey,
      },
      body: body ? JSON.stringify(body) : undefined,
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.message || `Request failed with status ${response.status}`)
    }

    return response.json()
  }

  /**
   * List documents with optional filtering
   */
  async listDocuments<T>(
    collectionId: string,
    options?: {
      queries?: QueryBuilder[]
      limit?: number
      offset?: number
      fields?: string[]
    }
  ): Promise<MavibaseResponse<T[]>> {
    const queryParams: Record<string, string> = {}

    if (options?.queries && options.queries.length > 0) {
      queryParams.queries = JSON.stringify(options.queries)
    }

    if (options?.limit) {
      queryParams.limit = options.limit.toString()
    }

    if (options?.offset) {
      queryParams.offset = options.offset.toString()
    }

    if (options?.fields) {
      queryParams.fields = options.fields.join(",")
    }

    return this.request<T[]>(
      "GET",
      `/databases/${this.databaseId}/collections/${collectionId}/documents`,
      undefined,
      queryParams
    )
  }

  /**
   * Get a single document by ID
   */
  async getDocument<T>(collectionId: string, documentId: string): Promise<MavibaseResponse<T>> {
    return this.request<T>(
      "GET",
      `/databases/${this.databaseId}/collections/${collectionId}/documents/${documentId}`
    )
  }

  /**
   * Create a new document
   */
  async createDocument<T>(
    collectionId: string,
    data: Record<string, unknown>,
    permissions?: Record<string, string[]>
  ): Promise<MavibaseResponse<T>> {
    const body = permissions ? { ...data, $permissions: permissions } : data
    return this.request<T>(
      "POST",
      `/databases/${this.databaseId}/collections/${collectionId}/documents`,
      body
    )
  }

  /**
   * Update a document
   */
  async updateDocument<T>(
    collectionId: string,
    documentId: string,
    data: Record<string, unknown>
  ): Promise<MavibaseResponse<T>> {
    return this.request<T>(
      "PUT",
      `/databases/${this.databaseId}/collections/${collectionId}/documents/${documentId}`,
      data
    )
  }

  /**
   * Delete a document
   */
  async deleteDocument(collectionId: string, documentId: string): Promise<MavibaseResponse<null>> {
    return this.request<null>(
      "DELETE",
      `/databases/${this.databaseId}/collections/${collectionId}/documents/${documentId}`
    )
  }
}

// ============================================================================
// QUERY BUILDER - Matches Mavibase QueryParser format
// ============================================================================

interface QueryBuilder {
  method: string
  attribute: string
  values: unknown[]
}

/**
 * Query helper functions that match Mavibase's QueryParser
 */
const Query = {
  // Equality
  equal: (field: string, value: unknown): QueryBuilder => ({
    method: "equal",
    attribute: field,
    values: [value],
  }),

  notEqual: (field: string, value: unknown): QueryBuilder => ({
    method: "notEqual",
    attribute: field,
    values: [value],
  }),

  // Comparisons
  lessThan: (field: string, value: number): QueryBuilder => ({
    method: "lessThan",
    attribute: field,
    values: [value],
  }),

  lessThanEqual: (field: string, value: number): QueryBuilder => ({
    method: "lessThanEqual",
    attribute: field,
    values: [value],
  }),

  greaterThan: (field: string, value: number): QueryBuilder => ({
    method: "greaterThan",
    attribute: field,
    values: [value],
  }),

  greaterThanEqual: (field: string, value: number): QueryBuilder => ({
    method: "greaterThanEqual",
    attribute: field,
    values: [value],
  }),

  // String operations
  contains: (field: string, value: string): QueryBuilder => ({
    method: "contains",
    attribute: field,
    values: [value],
  }),

  startsWith: (field: string, value: string): QueryBuilder => ({
    method: "startsWith",
    attribute: field,
    values: [value],
  }),

  endsWith: (field: string, value: string): QueryBuilder => ({
    method: "endsWith",
    attribute: field,
    values: [value],
  }),

  // Null checks
  isNull: (field: string): QueryBuilder => ({
    method: "isNull",
    attribute: field,
    values: [],
  }),

  isNotNull: (field: string): QueryBuilder => ({
    method: "isNotNull",
    attribute: field,
    values: [],
  }),

  // Range
  between: (field: string, min: unknown, max: unknown): QueryBuilder => ({
    method: "between",
    attribute: field,
    values: [min, max],
  }),

  // Array membership
  in: (field: string, values: unknown[]): QueryBuilder => ({
    method: "in",
    attribute: field,
    values: values,
  }),

  notIn: (field: string, values: unknown[]): QueryBuilder => ({
    method: "notIn",
    attribute: field,
    values: values,
  }),

  // Sorting & pagination
  orderBy: (field: string, direction: "asc" | "desc" = "asc"): QueryBuilder => ({
    method: "orderBy",
    attribute: field,
    values: [direction],
  }),

  limit: (value: number): QueryBuilder => ({
    method: "limit",
    attribute: "",
    values: [value],
  }),

  offset: (value: number): QueryBuilder => ({
    method: "offset",
    attribute: "",
    values: [value],
  }),

  // Logical operators
  and: (conditions: QueryBuilder[]): QueryBuilder => ({
    method: "and",
    attribute: "",
    values: [conditions],
  }),

  or: (conditions: QueryBuilder[]): QueryBuilder => ({
    method: "or",
    attribute: "",
    values: [conditions],
  }),
}

// ============================================================================
// REACT COMPONENT EXAMPLE
// ============================================================================

import { useState, useEffect } from "react"

// Initialize client
const mavibase = new MavibaseClient(MAVIBASE_CONFIG)

/**
 * Example: Fetch todos for a specific user
 */
export function UserTodos({ userId }: { userId: string }) {
  const [todos, setTodos] = useState<Todo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchUserTodos() {
      try {
        setLoading(true)
        setError(null)

        // =====================================================================
        // THE KEY PART: Filter todos by userId using Query.equal()
        // =====================================================================
        const response = await mavibase.listDocuments<Todo>(
          MAVIBASE_CONFIG.collectionId,
          {
            queries: [
              // Filter by userId field
              Query.equal("userId", userId),
              
              // Optional: Sort by creation date (newest first)
              Query.orderBy("$created_at", "desc"),
              
              // Optional: Limit results
              Query.limit(50),
            ],
          }
        )

        setTodos(response.data)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch todos")
      } finally {
        setLoading(false)
      }
    }

    fetchUserTodos()
  }, [userId])

  if (loading) return <div>Loading...</div>
  if (error) return <div>Error: {error}</div>

  return (
    <div>
      <h2>Todos for User: {userId}</h2>
      <ul>
        {todos.map((todo) => (
          <li key={todo.$id}>
            <input type="checkbox" checked={todo.completed} readOnly />
            {todo.title}
          </li>
        ))}
      </ul>
      {todos.length === 0 && <p>No todos found for this user.</p>}
    </div>
  )
}

/**
 * Example: Fetch todos with multiple filters (AND logic)
 */
export async function getIncompleteTodosForUser(userId: string): Promise<Todo[]> {
  const response = await mavibase.listDocuments<Todo>(
    MAVIBASE_CONFIG.collectionId,
    {
      queries: [
        // Multiple queries are combined with AND logic by default
        Query.equal("userId", userId),
        Query.equal("completed", false),
        Query.orderBy("dueDate", "asc"),
      ],
    }
  )
  return response.data
}

/**
 * Example: Fetch todos with OR logic (multiple users)
 */
export async function getTodosForMultipleUsers(userIds: string[]): Promise<Todo[]> {
  const response = await mavibase.listDocuments<Todo>(
    MAVIBASE_CONFIG.collectionId,
    {
      queries: [
        // Use "in" operator for multiple values
        Query.in("userId", userIds),
      ],
    }
  )
  return response.data
}

/**
 * Example: Create a todo with user-specific permissions
 */
export async function createTodoForUser(
  userId: string,
  title: string,
  description?: string
): Promise<Todo> {
  const response = await mavibase.createDocument<Todo>(
    MAVIBASE_CONFIG.collectionId,
    {
      title,
      description,
      completed: false,
      userId,
      dueDate: null,
    },
    // Optional: Set document-level permissions
    // Only this user can read/update/delete their own todo
    {
      read: [`user:${userId}`],
      update: [`user:${userId}`],
      delete: [`user:${userId}`],
    }
  )
  return response.data
}

// ============================================================================
// ALTERNATIVE: Using Collection-Level Permission Rules (RLS)
// ============================================================================

/**
 * Instead of filtering manually, you can set up collection-level RLS rules
 * in Mavibase that automatically filter documents based on the authenticated user.
 * 
 * When creating/updating a collection, set permission_rules like this:
 * 
 * {
 *   "read": ["owner"],           // Only document owner can read
 *   "update": ["owner"],         // Only document owner can update
 *   "delete": ["owner"],         // Only document owner can delete
 *   "create": ["user:*"]         // Any authenticated user can create
 * }
 * 
 * OR for team-based access:
 * 
 * {
 *   "read": ["team:team-id-here"],
 *   "update": ["role:admin", "owner"],
 *   "delete": ["role:admin"]
 * }
 * 
 * With RLS enabled, documents are automatically filtered server-side,
 * so you don't need to add Query.equal("userId", userId) - the API 
 * automatically returns only documents the user has access to.
 */

// ============================================================================
// FULL EXAMPLE: Todo App Component
// ============================================================================

export default function TodoApp() {
  const [currentUserId] = useState("user-123") // Get from your auth system
  const [todos, setTodos] = useState<Todo[]>([])
  const [newTodoTitle, setNewTodoTitle] = useState("")
  const [loading, setLoading] = useState(false)

  // Fetch user's todos
  const fetchTodos = async () => {
    setLoading(true)
    try {
      const response = await mavibase.listDocuments<Todo>(
        MAVIBASE_CONFIG.collectionId,
        {
          queries: [
            Query.equal("userId", currentUserId),
            Query.orderBy("$created_at", "desc"),
          ],
        }
      )
      setTodos(response.data)
    } catch (err) {
      console.error("Failed to fetch todos:", err)
    }
    setLoading(false)
  }

  // Create new todo
  const addTodo = async () => {
    if (!newTodoTitle.trim()) return
    
    try {
      const newTodo = await createTodoForUser(currentUserId, newTodoTitle)
      setTodos([newTodo, ...todos])
      setNewTodoTitle("")
    } catch (err) {
      console.error("Failed to create todo:", err)
    }
  }

  // Toggle todo completion
  const toggleTodo = async (todo: Todo) => {
    try {
      const updated = await mavibase.updateDocument<Todo>(
        MAVIBASE_CONFIG.collectionId,
        todo.$id,
        { completed: !todo.completed }
      )
      setTodos(todos.map((t) => (t.$id === todo.$id ? updated.data : t)))
    } catch (err) {
      console.error("Failed to update todo:", err)
    }
  }

  // Delete todo
  const deleteTodo = async (todoId: string) => {
    try {
      await mavibase.deleteDocument(MAVIBASE_CONFIG.collectionId, todoId)
      setTodos(todos.filter((t) => t.$id !== todoId))
    } catch (err) {
      console.error("Failed to delete todo:", err)
    }
  }

  useEffect(() => {
    fetchTodos()
  }, [currentUserId])

  return (
    <div style={{ maxWidth: "600px", margin: "0 auto", padding: "20px" }}>
      <h1>My Todos</h1>
      
      {/* Add Todo Form */}
      <div style={{ display: "flex", gap: "10px", marginBottom: "20px" }}>
        <input
          type="text"
          value={newTodoTitle}
          onChange={(e) => setNewTodoTitle(e.target.value)}
          placeholder="What needs to be done?"
          style={{ flex: 1, padding: "10px" }}
          onKeyDown={(e) => e.key === "Enter" && addTodo()}
        />
        <button onClick={addTodo} style={{ padding: "10px 20px" }}>
          Add
        </button>
      </div>

      {/* Todo List */}
      {loading ? (
        <p>Loading...</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0 }}>
          {todos.map((todo) => (
            <li
              key={todo.$id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                padding: "10px",
                borderBottom: "1px solid #eee",
              }}
            >
              <input
                type="checkbox"
                checked={todo.completed}
                onChange={() => toggleTodo(todo)}
              />
              <span
                style={{
                  flex: 1,
                  textDecoration: todo.completed ? "line-through" : "none",
                }}
              >
                {todo.title}
              </span>
              <button
                onClick={() => deleteTodo(todo.$id)}
                style={{ color: "red", border: "none", background: "none" }}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}

      {!loading && todos.length === 0 && (
        <p style={{ textAlign: "center", color: "#666" }}>
          No todos yet. Add one above!
        </p>
      )}
    </div>
  )
}
