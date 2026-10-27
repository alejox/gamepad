/** Whether a controller is paired, and from where. */
export interface ControllerStatus {
  connected: boolean;
  /** Remote address of the paired controller, or null when disconnected. */
  remoteAddress: string | null;
}

export type ControllerStatusListener = (status: ControllerStatus) => void;
