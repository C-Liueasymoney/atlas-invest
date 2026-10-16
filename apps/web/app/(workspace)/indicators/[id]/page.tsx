import { IndicatorDetail } from "@/components/catalog";
export default async function Indicator({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <IndicatorDetail id={id} />;
}
