import { redirect } from 'next/navigation'

export default function ConversationRedirect({ params }: { params: { chatId: string } }) {
  // Redirect /agency/conversation/:chatId -> /agency/conversation?chatId=...
  redirect(`/agency/conversation?chatId=${encodeURIComponent(params.chatId)}`)
}
