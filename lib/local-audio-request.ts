import { appApiErrorResponse } from "@/lib/app-api-errors";
import {
  isLocalAudioFileTooLarge,
  MAX_LOCAL_AUDIO_BYTES,
  MAX_LOCAL_AUDIO_REQUEST_BYTES
} from "@/lib/local-audio-limits";
import {
  cancelRequestBody,
  contentLengthExceedsLimit,
  limitRequestBody,
  RequestBodyLimitExceededError
} from "@/lib/request-body-limit";

export type LocalAudioMultipartResult =
  | { ok: true; file: File }
  | { ok: false; response: Response };

export async function readLocalAudioMultipart(
  request: Request,
  maxRequestBytes = MAX_LOCAL_AUDIO_REQUEST_BYTES
): Promise<LocalAudioMultipartResult> {
  if (contentLengthExceedsLimit(request, maxRequestBytes)) {
    cancelRequestBody(request, new RequestBodyLimitExceededError(maxRequestBytes));
    return { ok: false, response: appApiErrorResponse("local_audio_too_large", 413) };
  }

  const limitedBody = limitRequestBody(request, maxRequestBytes);
  let formData: FormData;
  try {
    formData = await limitedBody.request.formData();
  } catch {
    return {
      ok: false,
      response: limitedBody.exceeded
        ? appApiErrorResponse("local_audio_too_large", 413)
        : appApiErrorResponse("local_audio_invalid_multipart", 400)
    };
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { ok: false, response: appApiErrorResponse("local_audio_missing_file", 400) };
  }

  return { ok: true, file };
}

export function localAudioFileSizeRejection(
  file: Pick<Blob, "size">,
  maxFileBytes = MAX_LOCAL_AUDIO_BYTES
) {
  return isLocalAudioFileTooLarge(file, maxFileBytes)
    ? appApiErrorResponse("local_audio_too_large", 413)
    : null;
}
