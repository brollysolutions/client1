"use client";

import * as React from "react";

import {
  addLoanTxn,
  getTelecallerLead,
  logCallActivity,
  raiseFieldTask,
  updateLoanApplication,
  updateTelecallerLead,
  type LeadActivityCreate,
  type LoanApplicationProgressUpdate,
  type LoanTxnCreate,
  type TaskCreate,
  type TelecallerLeadDetail,
  type TelecallerLeadUpdate,
} from "@/lib/telecaller-api";
import type { ApiResponse } from "@/lib/api/client";

type Status = "loading" | "ready" | "error";

export function useTelecallerLeadDetail(leadId: string) {
  const [lead, setLead] = React.useState<TelecallerLeadDetail | null>(null);
  const [status, setStatus] = React.useState<Status>("loading");
  const [error, setError] = React.useState<string | null>(null);
  const [errorStatus, setErrorStatus] = React.useState<number | null>(null);
  const [reloadKey, setReloadKey] = React.useState(0);

  const retry = React.useCallback(() => {
    setStatus("loading");
    setError(null);
    setErrorStatus(null);
    setReloadKey((k) => k + 1);
  }, []);

  React.useEffect(() => {
    let active = true;
    const run = async () => {
      const res = await getTelecallerLead(leadId);
      if (!active) return;
      if (res.ok) {
        setLead(res.data);
        setStatus("ready");
        return;
      }
      setError(res.error);
      setErrorStatus(res.status);
      setStatus("error");
    };
    void run();
    return () => {
      active = false;
    };
  }, [leadId, reloadKey]);

  async function updateStatus(payload: TelecallerLeadUpdate): Promise<ApiResponse<unknown>> {
    const res = await updateTelecallerLead(leadId, payload);
    if (res.ok) retry();
    return res;
  }

  async function logCall(payload: LeadActivityCreate): Promise<ApiResponse<unknown>> {
    const res = await logCallActivity(leadId, payload);
    if (res.ok) retry();
    return res;
  }

  async function addTxn(
    applicationId: string,
    payload: LoanTxnCreate,
  ): Promise<ApiResponse<unknown>> {
    const res = await addLoanTxn(applicationId, payload);
    if (res.ok) retry();
    return res;
  }

  async function raiseTask(payload: TaskCreate): Promise<ApiResponse<unknown>> {
    const res = await raiseFieldTask(leadId, payload);
    if (res.ok) retry();
    return res;
  }

  async function updateApp(
    applicationId: string,
    payload: LoanApplicationProgressUpdate,
  ): Promise<ApiResponse<unknown>> {
    const res = await updateLoanApplication(applicationId, payload);
    if (res.ok) retry();
    return res;
  }

  return {
    lead,
    status,
    error,
    errorStatus,
    retry,
    updateStatus,
    logCall,
    addTxn,
    raiseTask,
    updateApp,
  };
}
