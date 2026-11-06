import type { Metadata } from "next";
import { GuideView } from "@/components/guide-view";
import { GUIDE_DOCS } from "@/lib/guide-docs";

export const metadata: Metadata = { title: "For developers · Story Workbench" };

export default function DevelopersGuidePage() {
  return <GuideView doc={GUIDE_DOCS.developers} />;
}
