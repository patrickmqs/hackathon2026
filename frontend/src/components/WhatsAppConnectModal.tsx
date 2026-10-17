"use client";

import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { api } from "@/lib/api";
import { errorMessage } from "@/components/Api";
import "./integration.css";

type Props = {
  open: boolean;
  onClose: () => void;
  onConnected: () => void;
};

export function WhatsAppConnectModal({ open, onClose, onConnected }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [statusText, setStatusText] = useState("Gerando QR code…");
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Abre/fecha o <dialog> conforme a prop `open`.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      if (pollRef.current) clearTimeout(pollRef.current);
      if (closeRef.current) clearTimeout(closeRef.current);
      setConnected(false);
      setError(null);
      setQrUrl(null);
      setPairingCode(null);
      setStatusText("Gerando QR code…");
      dialog.showModal();
      void poll();
    } else if (!open && dialog.open) {
      if (pollRef.current) clearTimeout(pollRef.current);
      dialog.close();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Limpa timers ao desmontar.
  useEffect(
    () => () => {
      if (pollRef.current) clearTimeout(pollRef.current);
      if (closeRef.current) clearTimeout(closeRef.current);
    },
    [],
  );

  async function poll() {
    try {
      const status = await api.whatsappStatus();
      if (status.connected) {
        setConnected(true);
        setStatusText("Conectado!");
        onConnected();
        closeRef.current = setTimeout(() => onClose(), 1600);
        return;
      }
      if (status.qr) {
        setQrUrl(await QRCode.toDataURL(status.qr, { margin: 1, width: 240 }));
        setStatusText("Abra o WhatsApp no celular e aponte para a tela");
      } else if (status.pairing_code) {
        setPairingCode(status.pairing_code);
        setStatusText("Use o código abaixo para parear no WhatsApp");
      } else {
        setStatusText("Aguardando QR code…");
      }
    } catch (requestError) {
      setError(errorMessage(requestError));
    }
    pollRef.current = setTimeout(() => void poll(), 2000);
  }

  return (
    <dialog
      ref={dialogRef}
      className="intake-modal whatsapp-modal"
      aria-labelledby="whatsapp-modal-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="card-heading">
        <div>
          <h2 id="whatsapp-modal-title">Conectar WhatsApp</h2>
          <p>Escaneie o QR code com o celular para parear esta conta.</p>
        </div>
        <button type="button" className="remove-file" onClick={onClose} aria-label="Fechar">
          ×
        </button>
      </div>

      <div className="wa-modal-body">
        {connected ? (
          <div className="wa-state success">✓ Conectado! Fechando…</div>
        ) : qrUrl ? (
          <>
            <img className="wa-qr" src={qrUrl} alt="QR code do WhatsApp" />
            <p className="wa-status">{statusText}</p>
          </>
        ) : pairingCode ? (
          <>
            <div className="wa-pairing-code">{pairingCode}</div>
            <p className="wa-status">{statusText}</p>
          </>
        ) : (
          <p className="wa-status">{statusText}</p>
        )}

        {error && (
          <p className="intake-message error" role="alert">
            {error}
          </p>
        )}
      </div>

      <div className="intake-modal-actions">
        <button type="button" className="button secondary" onClick={onClose}>
          Fechar
        </button>
      </div>
    </dialog>
  );
}
