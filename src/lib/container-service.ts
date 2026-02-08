import Docker from 'dockerode'
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'

export interface ContainerConfig {
  image: string
  name: string
  user: string
  workingDir: string
  env: Record<string, string>
  cmd: string[]
  hostConfig: {
    cpuCount: number
    memoryBytes: number
    pidsLimit: number
    readonlyRootfs: boolean
    tmpfs: Record<string, string>
    securityOpt: string[]
    networkMode: string
    capabilities: { drop: string[]; add: string[] }
  }
}

export interface SessionInfo {
  sessionId: string
  applicationId: string
  candidateId: string
  containerId: string
  networkId: string
  status: 'pending' | 'spawning' | 'active' | 'expired' | 'stopped' | 'error'
  vncUrl: string
  codeServerUrl: string
  workspacePath: string
  createdAt: Date
  expiresAt: Date
}

export interface SpawnOptions {
  applicationId: string
  candidateId: string
  sessionDurationMinutes?: number
}

const DEFAULT_IMAGE = 'candidate-sandbox:latest'
const DEFAULT_SESSION_DURATION_MINUTES = 60
const DEFAULT_CPU_COUNT = 2
const DEFAULT_MEMORY_BYTES = 4 * 1024 * 1024 * 1024 // 4GB
const DEFAULT_PIDS_LIMIT = 100

const docker = new Docker()

function generateSessionId(): string {
  return crypto.randomUUID()
}

function getDefaultContainerConfig(sessionId: string): ContainerConfig {
  return {
    image: DEFAULT_IMAGE,
    name: `session-${sessionId}`,
    user: 'candidate',
    workingDir: '/workspace',
    env: {
      SESSION_ID: sessionId,
      HOME: '/home/candidate',
    },
    cmd: ['/usr/bin/supervisord', '-c', '/etc/supervisor/supervisord.conf'],
    hostConfig: {
      cpuCount: DEFAULT_CPU_COUNT,
      memoryBytes: DEFAULT_MEMORY_BYTES,
      pidsLimit: DEFAULT_PIDS_LIMIT,
      readonlyRootfs: true,
      tmpfs: {
        '/tmp': 'rw,noexec,nosuid,size=100m',
        '/var/tmp': 'rw,noexec,nosuid,size=50m',
      },
      securityOpt: [
        'seccomp=/etc/docker/seccomp-default.json',
        'apparmor=docker-default',
      ],
      networkMode: 'bridge',
      capabilities: {
        drop: ['ALL'],
        add: ['CHOWN', 'SETGID', 'SETUID', 'DAC_OVERRIDE'],
      },
    },
  }
}

export async function pullImage(imageName: string): Promise<void> {
  try {
    const stream = await docker.pull(imageName)
    return new Promise((resolve, reject) => {
      stream.on('error', (err: Error) => {
        reject(new Error(`Failed to pull image: ${err.message}`))
      })
      stream.on('end', () => {
        resolve()
      })
    })
  } catch (error) {
    throw new Error(
      `Failed to pull image: ${error instanceof Error ? error.message : 'Unknown error'}`
    )
  }
}

export async function createNetwork(
  networkName: string,
  labels?: Record<string, string>
): Promise<string> {
  try {
    const network = await docker.createNetwork({
      Name: networkName,
      Driver: 'bridge',
      Internal: false,
      CheckDuplicate: true,
      Labels: {
        'hr-screening.managed': 'true',
        'hr-screening.createdAt': new Date().toISOString(),
        ...labels,
      },
    })
    return network.id
  } catch (error) {
    throw new Error(
      `Failed to create network: ${error instanceof Error ? error.message : 'Unknown error'}`
    )
  }
}

export async function createContainer(
  config: ContainerConfig,
  sessionId: string
): Promise<string> {
  try {
    const envArray = Object.entries(config.env).map(
      ([key, value]) => `${key}=${value}`
    )

    const container = await docker.createContainer({
      Image: config.image,
      name: config.name,
      User: config.user,
      WorkingDir: config.workingDir,
      Env: envArray,
      Cmd: config.cmd,
      Labels: {
        'hr-screening.sessionId': sessionId,
        'hr-screening.managed': 'true',
        'hr-screening.createdAt': new Date().toISOString(),
      },
      HostConfig: {
        CpuCount: config.hostConfig.cpuCount,
        Memory: config.hostConfig.memoryBytes,
        PidsLimit: config.hostConfig.pidsLimit,
        ReadonlyRootfs: config.hostConfig.readonlyRootfs,
        Tmpfs: config.hostConfig.tmpfs,
        SecurityOpt: config.hostConfig.securityOpt,
        NetworkMode: config.hostConfig.networkMode,
        CapDrop: config.hostConfig.capabilities.drop,
        CapAdd: config.hostConfig.capabilities.add,
      },
    })

    return container.id
  } catch (error) {
    throw new Error(
      `Failed to create container: ${error instanceof Error ? error.message : 'Unknown error'}`
    )
  }
}

export async function startContainer(containerId: string): Promise<void> {
  try {
    const container = docker.getContainer(containerId)
    await container.start()
  } catch (error) {
    throw new Error(
      `Failed to start container: ${error instanceof Error ? error.message : 'Unknown error'}`
    )
  }
}

export async function stopContainer(
  containerId: string,
  timeout: number = 30
): Promise<void> {
  try {
    const container = docker.getContainer(containerId)
    await container.stop({ t: timeout })
  } catch (error: any) {
    // 304 means container already stopped
    if (error.statusCode === 304) {
      return
    }
    throw new Error(
      `Failed to stop container: ${error instanceof Error ? error.message : 'Unknown error'}`
    )
  }
}

export async function removeContainer(
  containerId: string,
  force: boolean = false
): Promise<void> {
  try {
    const container = docker.getContainer(containerId)
    await container.remove({ force })
  } catch (error) {
    throw new Error(
      `Failed to remove container: ${error instanceof Error ? error.message : 'Unknown error'}`
    )
  }
}

export async function archiveWorkspace(
  containerId: string,
  destination: string
): Promise<void> {
  try {
    const container = docker.getContainer(containerId)
    const archiveStream = await container.getArchive({ path: '/workspace' })

    // Ensure destination directory exists
    const destDir = path.dirname(destination)
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true })
    }

    // Create write stream and pipe archive to it
    const writeStream = fs.createWriteStream(destination)
    archiveStream.pipe(writeStream)

    return new Promise((resolve, reject) => {
      writeStream.on('finish', () => {
        resolve()
      })
      writeStream.on('error', (err) => {
        reject(new Error(`Failed to archive workspace: ${err.message}`))
      })
    })
  } catch (error) {
    throw new Error(
      `Failed to archive workspace: ${error instanceof Error ? error.message : 'Unknown error'}`
    )
  }
}

export async function getSessionStatus(
  containerId: string
): Promise<SessionInfo | null> {
  try {
    const container = docker.getContainer(containerId)
    const info = await container.inspect()

    const labels = info.Config.Labels || {}
    const sessionId = labels['hr-screening.sessionId']
    const applicationId = labels['hr-screening.applicationId']
    const candidateId = labels['hr-screening.candidateId']

    if (!sessionId) {
      return null
    }

    let status: SessionInfo['status']
    if (info.State.Running) {
      status = 'active'
    } else if (info.State.FinishedAt) {
      status = 'expired'
    } else {
      status = 'stopped'
    }

    const networkName = Object.keys(info.NetworkSettings.Networks).find((name) =>
      name.startsWith('session-network-')
    )
    const networkInfo = networkName
      ? info.NetworkSettings.Networks[networkName]
      : null

    return {
      sessionId,
      applicationId: applicationId || '',
      candidateId: candidateId || '',
      containerId: info.Id,
      networkId: networkInfo ? networkInfo.NetworkID || '' : '',
      status,
      vncUrl: networkInfo ? `http://${networkInfo.IPAddress}:6080/vnc.html` : '',
      codeServerUrl: networkInfo
        ? `http://${networkInfo.IPAddress}:8080`
        : '',
      workspacePath: info.Config.WorkingDir || '/workspace',
      createdAt: new Date(info.State.StartedAt || info.Created),
      expiresAt: new Date(info.State.FinishedAt || Date.now()),
    }
  } catch (error: any) {
    if (error.statusCode === 404) {
      return null
    }
    throw error
  }
}

export async function createSession(
  options: SpawnOptions
): Promise<SessionInfo> {
  try {
    // Verify Docker is accessible
    await docker.ping()

    const sessionId = generateSessionId()
    const sessionDurationMinutes =
      options.sessionDurationMinutes || DEFAULT_SESSION_DURATION_MINUTES

    // Pull image if needed
    await pullImage(DEFAULT_IMAGE)

    // Create isolated network
    const networkName = `session-network-${sessionId}`
    const networkId = await createNetwork(networkName, {
      'hr-screening.sessionId': sessionId,
      'hr-screening.applicationId': options.applicationId,
      'hr-screening.candidateId': options.candidateId,
    })

    // Create container with security configuration
    const config = getDefaultContainerConfig(sessionId)
    config.env['APPLICATION_ID'] = options.applicationId
    config.env['CANDIDATE_ID'] = options.candidateId
    config.hostConfig.networkMode = networkName

    const containerId = await createContainer(config, sessionId)

    // Start container
    await startContainer(containerId)

    // Get container info for URLs
    const container = docker.getContainer(containerId)
    const containerInfo = await container.inspect()
    const networkInfo =
      containerInfo.NetworkSettings.Networks[networkName]

    const createdAt = new Date()
    const expiresAt = new Date(
      createdAt.getTime() + sessionDurationMinutes * 60 * 1000
    )

    return {
      sessionId,
      applicationId: options.applicationId,
      candidateId: options.candidateId,
      containerId,
      networkId,
      status: 'active',
      vncUrl: networkInfo
        ? `http://${networkInfo.IPAddress}:6080/vnc.html`
        : '',
      codeServerUrl: networkInfo ? `http://${networkInfo.IPAddress}:8080` : '',
      workspacePath: '/workspace',
      createdAt,
      expiresAt,
    }
  } catch (error) {
    throw new Error(
      `Failed to create session: ${error instanceof Error ? error.message : 'Unknown error'}`
    )
  }
}

export async function destroySession(
  sessionId: string,
  containerId: string,
  networkId: string
): Promise<void> {
  try {
    // Archive workspace before removal
    const archivePath = `/backups/sessions/${sessionId}-workspace.tar`
    try {
      await archiveWorkspace(containerId, archivePath)
    } catch (archiveError) {
      // Log but continue with cleanup even if archive fails
      console.error(`Failed to archive workspace for session ${sessionId}:`, archiveError)
    }

    // Stop container (ignore if already stopped)
    try {
      await stopContainer(containerId)
    } catch (stopError: any) {
      if (stopError.statusCode !== 304) {
        throw stopError
      }
    }

    // Remove container
    await removeContainer(containerId, true)

    // Remove network
    const network = docker.getNetwork(networkId)
    await network.remove()
  } catch (error) {
    throw new Error(
      `Failed to destroy session: ${error instanceof Error ? error.message : 'Unknown error'}`
    )
  }
}
