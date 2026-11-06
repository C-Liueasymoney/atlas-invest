import { InvestmentResult } from "@/components/investment-workspace";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <InvestmentResult id={id} />;
}
