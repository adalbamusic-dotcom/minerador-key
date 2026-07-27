"use client";

import { useEffect, useRef } from "react";

export type MineradorExtensionHandshakeResponderProps = {
  actorUserId: string;
  activeBrandId: string;
  activeBrandRef: string;
  activeBrandName: string;
  pathname: string;
  accessConfirmed: boolean;
  protocolVersion: 2;
};

type HandshakePing = {
  requestId?: unknown;
  protocolVersion?: unknown;
  module?: unknown;
  selectedBrandId?: unknown;
  selectedBrandRef?: unknown;
  extensionVersion?: unknown;
};

export default function MineradorExtensionHandshakeResponder(props: MineradorExtensionHandshakeResponderProps) {
  const propsRef = useRef(props);

  useEffect(() => {
    propsRef.current = props;
  }, [props]);

  useEffect(() => {
    const readyPayload = () => {
      const current = propsRef.current;
      return {
        type: "minerador_page_handshake_ready",
        actorUserId: current.actorUserId,
        activeBrandId: current.activeBrandId,
        activeBrandRef: current.activeBrandRef,
        activeBrandName: current.activeBrandName,
        pathname: current.pathname,
        accessConfirmed: current.accessConfirmed,
        protocolVersion: current.protocolVersion,
        timestamp: new Date().toISOString(),
      };
    };

    const dispatchReady = () => {
      window.dispatchEvent(new CustomEvent("minerador:page-handshake-ready", { detail: readyPayload() }));
    };

    const onPageHandshakeRequest = () => dispatchReady();
    const onHandshakePing = (event: Event) => {
      const detail = (event as CustomEvent<HandshakePing>).detail;
      if (!detail || typeof detail.requestId !== "string" || detail.protocolVersion !== 2 || detail.module !== "minerador") return;
      const current = propsRef.current;
      const matchesBrand = detail.selectedBrandId === current.activeBrandId && detail.selectedBrandRef === current.activeBrandRef;
      const authenticated = Boolean(current.actorUserId && current.accessConfirmed);
      window.dispatchEvent(new CustomEvent("minerador:extension-handshake-ack", {
        detail: {
          requestId: detail.requestId,
          ack: authenticated && matchesBrand,
          origin: window.location.origin,
          protocolVersion: current.protocolVersion,
          module: "minerador",
          authenticated,
          accessConfirmed: current.accessConfirmed,
          actorUserId: current.actorUserId,
          activeBrandId: current.activeBrandId,
          activeBrandRef: current.activeBrandRef,
          activeBrandName: current.activeBrandName,
          pathname: current.pathname,
          extensionVersion: detail.extensionVersion,
          errorCode: !authenticated ? "access_not_confirmed" : !matchesBrand ? "brand_mismatch" : undefined,
          timestamp: new Date().toISOString(),
        },
      }));
    };

    window.addEventListener("minerador:page-handshake-request", onPageHandshakeRequest);
    window.addEventListener("minerador:extension-handshake-ping", onHandshakePing);
    dispatchReady();

    return () => {
      window.removeEventListener("minerador:page-handshake-request", onPageHandshakeRequest);
      window.removeEventListener("minerador:extension-handshake-ping", onHandshakePing);
    };
  }, []);

  return null;
}
