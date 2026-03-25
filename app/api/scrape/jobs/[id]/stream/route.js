export const dynamic = "force-dynamic";
import { getScrapeJob, startScrapeWorker } from "../../../../../../lib/scraper/queue.js";

startScrapeWorker();

export async function GET(_req, { params }) {
  const id = Number(params?.id);
  if (!Number.isInteger(id) || id <= 0) {
    return new Response("invalid job id", { status: 400 });
  }

  const encoder = new TextEncoder();
  let timer;

  const stream = new ReadableStream({
    start(controller) {
      let lastFingerprint = "";
      const send = () => {
        const job = getScrapeJob(id);
        if (!job) {
          controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify({ error: "job not found" })}\n\n`));
          controller.close();
          if (timer) clearInterval(timer);
          return;
        }
        const payload = {
          job: {
            id: job.id,
            status: job.status,
            progress: job.progress,
            config: job.config,
            events: job.events.slice(0, 25).reverse(),
            pages: job.pages.slice(0, 40),
          },
        };
        const fingerprint = JSON.stringify([
          job.status,
          job.progress?.updatedAt,
          job.events?.[0]?.id,
          job.pages?.[0]?.id,
        ]);
        if (fingerprint !== lastFingerprint) {
          controller.enqueue(encoder.encode(`event: message\ndata: ${JSON.stringify(payload)}\n\n`));
          lastFingerprint = fingerprint;
        }
        if (["completed", "failed", "cancelled"].includes(job.status)) {
          controller.enqueue(encoder.encode(`event: done\ndata: ${JSON.stringify(payload)}\n\n`));
          controller.close();
          if (timer) clearInterval(timer);
        }
      };

      send();
      timer = setInterval(send, 1200);
    },
    cancel() {
      if (timer) clearInterval(timer);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
