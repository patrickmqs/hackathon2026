import { Suspense } from "react";
import ReportView from "./ReportView";

export default function DashboardReportPage() {
  return <Suspense fallback={<div className="report-loading">Carregando relatório...</div>}><ReportView /></Suspense>;
}
