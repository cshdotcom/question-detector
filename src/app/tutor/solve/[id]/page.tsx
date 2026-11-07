"use client"

import { useRouter, useParams } from "next/navigation"
import { TutorChat } from "@/components/question-detector/TutorChat"
import { Toaster as SonnerToaster } from "@/components/ui/sonner"

export default function SolvePage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const id = params?.id || ""
  return (
    <>
      <SonnerToaster />
      <TutorChat sessionId={id} onBack={() => router.push("/tutor")} />
    </>
  )
}
