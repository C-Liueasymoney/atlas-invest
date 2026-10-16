import { Preferences } from "@/components/shell";
import { PageHeading } from "@/components/ui";
export default function Settings() {
  return (
    <>
      <PageHeading
        eyebrow="YOUR PREFERENCES"
        title="偏好设置"
        description="按你的研究习惯，定制工作空间。"
      />
      <Preferences />
    </>
  );
}
