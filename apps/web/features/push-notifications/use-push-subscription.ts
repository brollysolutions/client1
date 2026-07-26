"use client";

import * as React from "react";
import { toast } from "sonner";

import { getVapidPublicKey, subscribePush, unsubscribePush } from "@/lib/push-notifications";

export type PushSubscriptionStatus =
  | "checking"
  | "unsupported"
  | "unconfigured"
  | "default"
  | "denied"
  | "subscribing"
  | "subscribed"
  | "unsubscribing";

function urlBase64ToUint8Array(base64Url: string): Uint8Array {
  const padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

function supportsPush(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window;
}

export function usePushSubscription() {
  const [status, setStatus] = React.useState<PushSubscriptionStatus>("checking");
  const vapidKeyRef = React.useRef<string>("");

  const check = React.useCallback(async () => {
    if (!supportsPush()) {
      setStatus("unsupported");
      return;
    }

    const keyRes = await getVapidPublicKey();
    const vapidKey = keyRes.ok ? keyRes.data : "";
    vapidKeyRef.current = vapidKey;
    if (!vapidKey) {
      setStatus("unconfigured");
      return;
    }

    if (Notification.permission === "denied") {
      setStatus("denied");
      return;
    }

    const registration = await navigator.serviceWorker.getRegistration();
    const existing = await registration?.pushManager.getSubscription();
    setStatus(existing ? "subscribed" : "default");
  }, []);

  React.useEffect(() => {
    check();
  }, [check]);

  const subscribe = React.useCallback(async () => {
    // Must run inside a user-gesture handler (the button's onClick) — a
    // browser permission prompt fired without one is either silently
    // ignored or auto-denied, and this app never auto-fires permission
    // prompts on load.
    setStatus("subscribing");
    let createdSubscription: PushSubscription | null = null;
    try {
      await navigator.serviceWorker.register("/sw.js");
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus(permission === "denied" ? "denied" : "default");
        return;
      }

      const ready = await navigator.serviceWorker.ready;
      createdSubscription = await ready.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKeyRef.current) as BufferSource,
      });
      const json = createdSubscription.toJSON();
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
        throw new Error("Browser returned an incomplete push subscription.");
      }

      const res = await subscribePush({
        endpoint: json.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
      });
      if (!res.ok) throw new Error(res.error);

      setStatus("subscribed");
      toast.success("Notifications enabled.", {
        description: "You'll get a push notification for important updates.",
      });
    } catch (err) {
      // Roll back the browser-side subscription so a failed server call
      // doesn't leave the browser subscribed while the backend has no
      // record of it (the next mount would otherwise misreport "subscribed").
      if (createdSubscription) await createdSubscription.unsubscribe().catch(() => {});
      setStatus("default");
      toast.error("Couldn't enable notifications.", {
        description: err instanceof Error ? err.message : "Please try again in a moment.",
      });
    }
  }, []);

  const unsubscribe = React.useCallback(async () => {
    setStatus("unsubscribing");
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      if (!subscription) {
        setStatus("default");
        return;
      }

      // Tell the backend first, while the endpoint value is still known — a
      // server-side failure then leaves the browser still subscribed
      // (recoverable) instead of the backend holding a dead row with no way
      // for the UI to find it again.
      const res = await unsubscribePush(subscription.endpoint);
      if (!res.ok) throw new Error(res.error);

      await subscription.unsubscribe();
      setStatus("default");
      toast.success("Notifications disabled.");
    } catch (err) {
      setStatus("subscribed");
      toast.error("Couldn't disable notifications.", {
        description: err instanceof Error ? err.message : "Please try again in a moment.",
      });
    }
  }, []);

  return { status, subscribe, unsubscribe };
}
