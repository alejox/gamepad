/** Whether a controller is paired, and from where. */
export interface ControllerStatus {
  connected: boolean;
  /** Remote address of the paired controller, or null when disconnected. */
  remoteAddress: string | null;
}

export type ControllerStatusListener = (status: ControllerStatus) => void;

/** A phone waiting for the host user to approve it (pairing without PIN). */
export interface PendingRequest {
  remoteAddress: string;
  /** Device name sent by the phone; untrusted display text. */
  device: string;
}

/** Host-side decision on the pending approval request. */
export interface PairingApproval {
  /** Returns false when nothing was pending. */
  approve(): boolean;
  /** Returns false when nothing was pending. */
  deny(): boolean;
}
