// Stands in for @sentry/replay and @sentry/feedback on web (see ../metro.config.js). `@sentry/browser`
// re-exports their names and calls `buildFeedbackIntegration` once while loading, so an empty module
// would break Sentry's initialization (found with a dummy-DSN browser probe). Everything else only
// fails, loudly, if somebody starts using replay or the feedback widget without removing the stub.
const stripped = () => {
  throw new Error('Sentry replay/feedback are stripped from this build (apps/app/metro.config.js)');
};

module.exports = {
  buildFeedbackIntegration: () => stripped,
  feedbackModalIntegration: stripped,
  feedbackScreenshotIntegration: stripped,
  getFeedback: () => undefined,
  sendFeedback: stripped,
  getReplay: () => undefined,
  replayIntegration: stripped,
};
