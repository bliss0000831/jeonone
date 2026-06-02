/**
 * @gwangjang/features/chat — 광장 채팅 도메인.
 *
 * Phase 2B-1 에서 placeholder 였던 api 가 실제 구현됨.
 * 1:1 직접 채팅 (chat_rooms / messages) 만. 모임/공동구매는 추후.
 */

// API
export {
  listChatRooms,
  getChatRoom,
  listMessages,
  sendMessage,
  markAsRead,
  subscribeToMessages,
  listRoomParticipants,
  loadPostContext,
  listExperts,
  getExpert,
  inviteExpert,
  listClubRooms,
  listGbRooms,
  leaveDirectRoom,
  reportChatRoom,
  startPostChat,
  startDirectChat,
  type PostChatType,
} from "./api"

// Types — packages/types 에서 가져온 표준 타입을 re-export (편의)
export type {
  ChatRoom,
  ChatRoomWithMeta,
  ChatPostType,
  Message,
  ChatParticipant,
  AccountType,
  Expert,
  ExpertInvitation,
  InviteExpertInput,
  ChatContextDescriptor,
  ClubChatRoom,
  GbChatRoom,
  ChatReportReason,
} from "@gwangjang/types/chat"

// 기존 helpers — Phase 2B-1 에서도 그대로
export { validateMessage, type ValidationError } from "./validators"
export { formatChatTime, formatChatDate, previewMessage } from "./formatters"

// Chat preferences — 스토리지 어댑터 패턴
export {
  createChatPrefs,
  type ChatPrefs,
  type ChatPrefsStorage,
} from "./prefs"
