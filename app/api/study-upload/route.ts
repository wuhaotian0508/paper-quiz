import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { STUDY_CONTENT_TYPES } from "@/lib/study-upload";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as HandleUploadBody;
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: STUDY_CONTENT_TYPES,
        addRandomSuffix: true,
        cacheControlMaxAge: 60,
      }),
    });
    return Response.json(result);
  } catch (cause) {
    console.error(
      "Study upload authorization failed",
      cause instanceof Error ? cause.message : "unknown error",
    );
    return Response.json({ error: "Study file upload could not be started." }, { status: 400 });
  }
}
