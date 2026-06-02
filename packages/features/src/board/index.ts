/**
 * @gwangjang/features/board — 게시판 도메인.
 */
export {
  getBoardPost,
  listBoardComments,
  createBoardComment,
  deleteBoardComment,
  toggleBoardLike,
  isBoardPostLiked,
  deleteBoardPost,
  listBoardCategories,
  createBoardPost,
  updateBoardPost,
  type BoardPost,
  type BoardComment,
  type BoardCategory,
  type BoardCreateInput,
} from "./api"
