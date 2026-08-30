type FireAndForgetSaveCallbacks = {
  onSuccess: () => void;
  onError: (error: unknown) => void;
};

/**
 * Starts a UI persistence action without making the event handler async while
 * still consuming both synchronous throws and asynchronous rejections.
 */
export function runFireAndForgetSave(
  operation: () => void | Promise<void>,
  { onSuccess, onError }: FireAndForgetSaveCallbacks
) {
  try {
    void Promise.resolve(operation())
      .then(onSuccess)
      .catch(onError);
  } catch (error) {
    onError(error);
  }
}
