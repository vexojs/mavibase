"use client"

import type React from "react"
import { createContext, useContext, useEffect, useState, type Dispatch, type SetStateAction } from "react"
import axiosInstance from "@/lib/axios-instance"

interface AuthContextType {
  user: any
  loading: boolean
  logout: () => Promise<void>
  refreshUser: () => Promise<void>
  setUser: Dispatch<SetStateAction<any>>
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, _setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  const setUser: Dispatch<SetStateAction<any>> = (updater) => {
    _setUser((prev) => {
      const next = typeof updater === "function" ? (updater as any)(prev) : updater

      if (next) {
        localStorage.setItem("user", JSON.stringify(next))
      } else {
        localStorage.removeItem("user")
      }

      return next
    })
  }

  useEffect(() => {
    const cached = localStorage.getItem("user")
    if (cached) {
      try {
        const parsed = JSON.parse(cached)
        _setUser(parsed)
      } catch {
        localStorage.removeItem("user")
      }
    }

    verifyAuthentication()
  }, [])

  const verifyAuthentication = async () => {
    console.log("[v0] verifyAuthentication called")
    try {
      // Debug: Try native fetch first to see if it's an axios issue
      console.log("[v0] Testing with native fetch first...")
      try {
        const fetchRes = await fetch("http://localhost:5000/api/v1/platform/auth/verify-token", {
          method: "GET",
          credentials: "include",
        })
        console.log("[v0] Native fetch response status:", fetchRes.status)
        const fetchData = await fetchRes.json()
        console.log("[v0] Native fetch response data:", fetchData)
      } catch (fetchErr: any) {
        console.log("[v0] Native fetch error:", fetchErr.message)
      }
      
      console.log("[v0] Making GET request to /auth/verify-token via axios")
      const res = await axiosInstance.auth.get("/auth/verify-token", {
        withCredentials: true,
      })
      console.log("[v0] verify-token response:", res.data)

      if (res.data.success && res.data.data?.user) {
        const freshUser = res.data.data.user
        setUser(freshUser)
        return freshUser
      } else {
        _setUser(null)
        localStorage.removeItem("user")
        return null
      }
    } catch (err: any) {
      console.log("[v0] verify-token error:", err.message, err.response?.status, err.code)
      if (err.response?.status === 401) {
        try {
          await axiosInstance.auth.post("/auth/refresh-token")
          // After refresh, try verify again
          const retryRes = await axiosInstance.auth.get("/auth/verify-token")
          if (retryRes.data.success && retryRes.data.data?.user) {
            const freshUser = retryRes.data.data.user
            setUser(freshUser)
            return freshUser
          } else {
            throw new Error("Verification failed after refresh")
          }
        } catch (refreshErr) {
          _setUser(null)
          localStorage.removeItem("user")
          return null
        }
      } else {
        _setUser(null)
        localStorage.removeItem("user")
        return null
      }
    } finally {
      setLoading(false)
    }
  }

  const refreshUser = async () => {
    const freshUser = await verifyAuthentication()
    return freshUser
  }

  const logout = async () => {
    try {
      await axiosInstance.auth.post("/auth/logout", {}, { withCredentials: true })
    } catch {}

    setUser(null)
    window.location.href = "/login"
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        logout,
        refreshUser,
        setUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export const useAuthContext = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuthContext must be inside AuthProvider")
  return ctx
}
