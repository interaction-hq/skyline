export {
  SlackGrpcClient,
  slackGrpcTarget,
  type SlackGrpcHandlers,
} from "./grpc";
export {
  SlackClient,
  SlackError,
  type SlackCreds,
  type SlackSendResult,
} from "./rest";
export {
  connectSlackSocket,
  type SlackInboundHandlers,
  type SlackSocketOptions,
} from "./socket";
