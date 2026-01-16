/**
 * Intiface Central service
 *
 * Minimal buttplug.io client using raw WebSocket (Bun-compatible)
 * for controlling intimate hardware devices.
 *
 * Provides persistent "presence" vibration while Claude Code is actively working.
 * State is stored in Redis so it survives container restarts.
 */

import type { ServerMessage } from "./types";

interface IntifaceDevice {
  index: number;
  name: string;
  capabilities: {
    vibrate?: {
      motors: number;
      steps: number[];
    };
    rotate?: {
      motors: number;
      steps: number[];
    };
    linear?: {
      motors: number;
      steps: number[];
    };
  };
}

interface DeviceMessage {
  DeviceIndex: number;
  DeviceName: string;
  DeviceMessages: {
    ScalarCmd?: { StepCount: number; ActuatorType: string }[];
    RotateCmd?: { StepCount: number }[];
    LinearCmd?: { StepCount: number }[];
  };
}

const DEFAULT_STRENGTH = 0.15; // Low intensity for ambient presence

export class IntifaceState {
  // Connection state
  private ws: WebSocket | null = null;
  private devices: Map<number, IntifaceDevice> = new Map();
  private messageId: number = 1;
  private pendingMessages: Map<
    number,
    { resolve: (v: unknown) => void; reject: (e: Error) => void }
  > = new Map();
  private connectionPromise: Promise<void> | null = null;
  private wsUrl: string | null = null;

  // State
  public active: boolean = false;
  public device: number = 0;
  public strength: number = 0.15;
  public since: string | null = null; // ISO timestamp

  // Last working count
  private lastWorkingCount: number = 0;

  constructor(
    wsUrl: string = process.env.INTIFACE_WS_URL ?? "ws://127.0.0.1:12345"
  ) {
    this.wsUrl = wsUrl;
    this.active = false;
    this.device = 0;
    this.strength = 0.15;
    this.since = null;
  }

  async onSessionStateMessage(message: ServerMessage): Promise<void> {
    // Check if working count changed for webhooks
    if (message.type === "state") {
      const workingChanged = message.working !== this.lastWorkingCount;
      const isNowWorking = message.working > 0;
      const wasWorking = this.lastWorkingCount > 0;

      if (workingChanged && isNowWorking !== wasWorking) {
        try {
          if (isNowWorking) {
            console.log('[intiface] Starting vibration');
            await this.vibrate(this.device, this.strength);
          } else {
            console.log('[intiface] Stopping vibration');
            await this.stop(this.device);
          }
        } catch (err) {
          console.error('[intiface] Failed to control device:', err);
          // Don't throw - state is saved, device control is best-effort
        }
      }

      this.lastWorkingCount = message.working;
    }
  }

  async setState(
    active: boolean,
    device = 0,
    strength = DEFAULT_STRENGTH
  ): Promise<void> {
    // Only act if state is actually changing
    const wasActive = this.active;
    const isChanging = active !== wasActive;

    this.active = active;
    this.device = device;
    this.strength = strength;
    this.since = active
      ? wasActive
        ? this.since
        : new Date().toISOString()
      : null;

    // Control device if state changed
    if (isChanging) {
      try {
        if (active) {
          console.log(
            `[intiface] Starting work presence vibration (device=${device}, strength=${strength})`
          );
          await this.vibrate(device, strength);
        } else {
          console.log(
            `[intiface] Stopping work presence vibration (device=${device})`
          );
          await this.stop(device);
        }
      } catch (err) {
        console.error("[intiface] Failed to control device:", err);
        // Don't throw - state is saved, device control is best-effort
      }
    }
  }

  async start(device = 0, strength = DEFAULT_STRENGTH): Promise<void> {
    await this.setState(true, device, strength);
  }

  async toggle(device = 0, strength = DEFAULT_STRENGTH): Promise<void> {
    await this.setState(!this.active, device, strength);
  }

  async restore(): Promise<void> {
    await this.setState(this.active, this.device, this.strength);
  }

  async sendHaptic(strength: number, durationMs = 2000): Promise<void> {
    await this.ensureConnected();

    const deviceList = this.getDevices();
    const vibrateDevice = deviceList.find((d) => d.capabilities.vibrate);

    if (!vibrateDevice) {
      console.warn("[intiface] No vibration-capable device found");
      return;
    }

    await this.vibrateForDuration(vibrateDevice.index, strength, durationMs);
  }

  nextId(): number {
    return this.messageId++;
  }

  send(
    msgType: string,
    payload: Record<string, unknown> = {}
  ): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error("Not connected"));
        return;
      }
      const id = this.nextId();
      // Buttplug message format: [{"MessageType": {"Id": N, ...payload}}]
      const wrappedMsg = [{ [msgType]: { Id: id, ...payload } }];
      this.pendingMessages.set(id, { resolve, reject });
      this.ws.send(JSON.stringify(wrappedMsg));
    });
  }

  handleMessage(data: string): void {
    try {
      const messages = JSON.parse(data) as Record<string, unknown>[];
      for (const msg of messages) {
        const [type, content] = Object.entries(msg)[0] as [
          string,
          Record<string, unknown>
        ];
        const id = content.Id as number;

        if (type === "DeviceAdded") {
          const device = this.parseDevice(content as unknown as DeviceMessage);
          this.devices.set(device.index, device);
          console.log(
            `[intiface] Device added: ${device.name} (${device.index})`
          );
        } else if (type === "DeviceRemoved") {
          const index = content.DeviceIndex as number;
          const device = this.devices.get(index);
          if (device) {
            console.log(`[intiface] Device removed: ${device.name} (${index})`);
            this.devices.delete(index);
          }
        } else if (type === "DeviceList") {
          const deviceList = content.Devices as DeviceMessage[];
          for (const d of deviceList) {
            const device = this.parseDevice(d);
            this.devices.set(device.index, device);
            console.log(
              `[intiface] Device found: ${device.name} (${device.index})`
            );
          }
          // Resolve pending promise
          const pending = this.pendingMessages.get(id);
          if (pending) {
            this.pendingMessages.delete(id);
            pending.resolve(content);
          }
        } else if (type === "ScanningFinished") {
          console.log("[intiface] Device scanning finished");
        } else if (type === "Error") {
          const pending = this.pendingMessages.get(id);
          if (pending) {
            this.pendingMessages.delete(id);
            pending.reject(new Error(content.ErrorMessage as string));
          }
        } else if (type === "Ok" || type === "ServerInfo") {
          const pending = this.pendingMessages.get(id);
          if (pending) {
            this.pendingMessages.delete(id);
            pending.resolve(content);
          }
        }
      }
    } catch (err) {
      console.error("[intiface] Failed to parse message:", err);
    }
  }

  parseDevice(d: DeviceMessage): IntifaceDevice {
    const vibrate = d.DeviceMessages.ScalarCmd?.filter(
      (s) => s.ActuatorType === "Vibrate"
    );
    const rotate = d.DeviceMessages.RotateCmd;
    const linear = d.DeviceMessages.LinearCmd;

    return {
      index: d.DeviceIndex,
      name: d.DeviceName,
      capabilities: {
        vibrate: vibrate?.length
          ? { motors: vibrate.length, steps: vibrate.map((v) => v.StepCount) }
          : undefined,
        rotate: rotate?.length
          ? { motors: rotate.length, steps: rotate.map((r) => r.StepCount) }
          : undefined,
        linear: linear?.length
          ? { motors: linear.length, steps: linear.map((l) => l.StepCount) }
          : undefined,
      },
    };
  }

  async connect(): Promise<void> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return;
    if (this.connectionPromise) return this.connectionPromise;

    this.connectionPromise = new Promise((resolve, reject) => {
      const wsUrl = this.wsUrl;
      if (!wsUrl) {
        reject(new Error("WebSocket URL not set"));
        return;
      }
      console.log(`[intiface] Connecting to ${wsUrl}...`);

      try {
        this.ws = new WebSocket(wsUrl);
      } catch (err) {
        console.error("[intiface] WebSocket constructor error:", err);
        reject(err);
        this.connectionPromise = null;
        return;
      }

      const timeout = setTimeout(() => {
        this.ws?.close();
        reject(new Error("Connection timeout"));
        this.connectionPromise = null;
      }, 10000);

      this.ws.onopen = async () => {
        clearTimeout(timeout);
        console.log("[intiface] WebSocket connected");
        try {
          // Send handshake
          await this.send("RequestServerInfo", {
            ClientName: "Familiar",
            MessageVersion: 3,
          });
          console.log("[intiface] Handshake complete");

          // Request device list
          await this.send("RequestDeviceList");

          // Start scanning
          await this.send("StartScanning");
          console.log("[intiface] Started device scanning");

          resolve();
        } catch (err) {
          reject(err);
        }
        this.connectionPromise = null;
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(event.data as string);
      };

      this.ws.onerror = (event) => {
        clearTimeout(timeout);
        console.error("[intiface] WebSocket error:", event);
        reject(new Error("WebSocket error"));
        this.connectionPromise = null;
      };

      this.ws.onclose = () => {
        console.log("[intiface] Disconnected from server");
        this.ws = null;
        this.devices.clear();
        this.pendingMessages.clear();
      };
    });

    return this.connectionPromise;
  }

  async disconnect(): Promise<void> {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.devices.clear();
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  getDevices(): IntifaceDevice[] {
    return Array.from(this.devices.values());
  }

  async vibrate(
    deviceIndex: number,
    strength: number,
    motor?: number
  ): Promise<void> {
    await this.ensureConnected();

    const device = this.devices.get(deviceIndex);
    if (!device) throw new Error(`Device ${deviceIndex} not found`);
    if (!device.capabilities.vibrate)
      throw new Error(`Device ${deviceIndex} does not support vibration`);

    const clampedStrength = Math.max(0, Math.min(1, strength));
    const motorCount = device.capabilities.vibrate.motors;

    const scalars = [];
    for (let i = 0; i < motorCount; i++) {
      scalars.push({
        Index: i,
        Scalar: motor === undefined || motor === i ? clampedStrength : 0,
        ActuatorType: "Vibrate",
      });
    }

    await this.send("ScalarCmd", {
      DeviceIndex: deviceIndex,
      Scalars: scalars,
    });
  }

  async rotate(
    deviceIndex: number,
    speed: number,
    clockwise = true,
    motor?: number
  ): Promise<void> {
    await this.ensureConnected();

    const device = this.devices.get(deviceIndex);
    if (!device) throw new Error(`Device ${deviceIndex} not found`);
    if (!device.capabilities.rotate)
      throw new Error(`Device ${deviceIndex} does not support rotation`);

    const clampedSpeed = Math.max(0, Math.min(1, speed));
    const motorCount = device.capabilities.rotate.motors;

    const rotations = [];
    for (let i = 0; i < motorCount; i++) {
      rotations.push({
        Index: i,
        Speed: motor === undefined || motor === i ? clampedSpeed : 0,
        Clockwise: clockwise,
      });
    }

    await this.send("RotateCmd", {
      DeviceIndex: deviceIndex,
      Rotations: rotations,
    });
  }

  async linear(
    deviceIndex: number,
    position: number,
    durationMs: number,
    motor?: number
  ): Promise<void> {
    await this.ensureConnected();

    const device = this.devices.get(deviceIndex);
    if (!device) throw new Error(`Device ${deviceIndex} not found`);
    if (!device.capabilities.linear)
      throw new Error(`Device ${deviceIndex} does not support linear movement`);

    const clampedPosition = Math.max(0, Math.min(1, position));
    const motorCount = device.capabilities.linear.motors;

    const vectors = [];
    for (let i = 0; i < motorCount; i++) {
      vectors.push({
        Index: i,
        Duration: durationMs,
        Position: motor === undefined || motor === i ? clampedPosition : 0,
      });
    }

    await this.send("LinearCmd", {
      DeviceIndex: deviceIndex,
      Vectors: vectors,
    });
  }

  async stop(deviceIndex: number): Promise<void> {
    await this.ensureConnected();

    const device = this.devices.get(deviceIndex);
    if (!device) throw new Error(`Device ${deviceIndex} not found`);

    await this.send("StopDeviceCmd", { DeviceIndex: deviceIndex });
  }

  async stopAll(): Promise<void> {
    if (!this.isConnected()) return;
    await this.send("StopAllDevices");
  }

  async getBattery(deviceIndex: number): Promise<number | null> {
    await this.ensureConnected();

    const device = this.devices.get(deviceIndex);
    if (!device) throw new Error(`Device ${deviceIndex} not found`);

    try {
      const result = (await this.send("BatteryLevelCmd", {
        DeviceIndex: deviceIndex,
      })) as {
        BatteryLevel: number;
      };
      return result.BatteryLevel;
    } catch {
      return null;
    }
  }

  async ensureConnected(): Promise<void> {
    if (!this.isConnected()) {
      await this.connect();
    }
    // Wait for at least one device (up to 5 seconds)
    for (let i = 0; i < 10; i++) {
      if (this.devices.size > 0) return;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  async vibrateForDuration(
    deviceIndex: number,
    strength: number,
    durationMs: number
  ): Promise<void> {
    await this.vibrate(deviceIndex, strength);
    await new Promise((resolve) => setTimeout(resolve, durationMs));
    await this.vibrate(deviceIndex, 0);
  }
}
