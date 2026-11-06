import type { Metadata } from "next";
import { GuideView } from "@/components/guide-view";
import { GUIDE_DOCS } from "@/lib/guide-docs";

export const metadata: Metadata = { title: "Guide · Story Workbench" };

export default function GuidePage() {
  return <GuideView doc={GUIDE_DOCS.team} />;
}
