import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "最后防线 · 全面反击" },
      {
        name: "description",
        content:
          "最后防线扩展版：30波战役、无限波次、连续无尽生存、12种武器与独立技能、双战术技能与原创电子配乐。",
      },
      { property: "og:title", content: "最后防线 · 全面反击" },
      {
        property: "og:description",
        content:
          "最后防线扩展版：30波战役、无限波次、连续无尽生存、12种武器与独立技能、双战术技能与原创电子配乐。",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "/" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "/" }],
  }),
});

function Index() {
  return (
    <>
      {/* Applies immediately and to badges injected later; no dismissal or spacer required. */}
      <style>{`#lovable-badge { display: none !important; }`}</style>
      <iframe
        src="/game/index.html"
        title="最后防线 · 全面反击"
        allow="fullscreen; autoplay; gamepad"
        allowFullScreen
        className="fixed inset-0 block h-dvh w-full border-0"
      />
    </>
  );
}
