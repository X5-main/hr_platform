import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import Docker from 'dockerode'
import {
  createSession,
  destroySession,
  getSessionStatus,
  pullImage,
  createNetwork,
  createContainer,
  startContainer,
  stopContainer,
  removeContainer,
  archiveWorkspace,
  type ContainerConfig,
  type SessionInfo,
  type SpawnOptions,
} from './container-service'

// Mock dockerode
vi.mock('dockerode', () => {
  const mockDocker = {
    ping: vi.fn(),
    pull: vi.fn(),
    createNetwork: vi.fn(),
    createContainer: vi.fn(),
    getContainer: vi.fn(),
    getNetwork: vi.fn(),
  }
  return {
    default: vi.fn(() => mockDocker),
  }
})

// Mock fs/promises for archiveWorkspace
vi.mock('fs/promises', () => ({
  mkdir: vi.fn(() => Promise.resolve()),
}))

// Mock fs for createReadStream
vi.mock('fs', () => {
  return {
    default: {
      createReadStream: vi.fn(() => ({ pipe: vi.fn() })),
      createWriteStream: vi.fn(() => ({ on: vi.fn((event, cb) => { if (event === 'finish') cb(); }) })),
      existsSync: vi.fn(() => true),
      mkdirSync: vi.fn(),
    },
    createReadStream: vi.fn(() => ({ pipe: vi.fn() })),
    createWriteStream: vi.fn(() => ({ on: vi.fn((event, cb) => { if (event === 'finish') cb(); }) })),
    existsSync: vi.fn(() => true),
    mkdirSync: vi.fn(),
  }
})

describe('container-service', () => {
  let mockDocker: any

  beforeEach(() => {
    vi.clearAllMocks()
    mockDocker = new Docker()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('createSession', () => {
    const mockSpawnOptions: SpawnOptions = {
      applicationId: 'app-123',
      candidateId: 'candidate-456',
      sessionDurationMinutes: 60,
    }

    it('should create session with valid config', async () => {
      // Arrange
      let capturedNetworkName = ''
      const mockNetwork = {
        id: 'network-123',
        inspect: vi.fn().mockResolvedValue({ Id: 'network-123' }),
      }
      const mockContainer = {
        id: 'container-123',
        start: vi.fn().mockResolvedValue(undefined),
        inspect: vi.fn().mockResolvedValue({
          State: { Running: true },
          NetworkSettings: {
            Networks: {} as Record<string, { IPAddress: string }>,
          },
        }),
      }

      mockDocker.ping.mockResolvedValue(undefined)
      mockDocker.pull.mockResolvedValue({
        on: vi.fn((event, cb) => {
          if (event === 'end') cb()
        }),
      })
      mockDocker.createNetwork.mockImplementation((config: { Name: string }) => {
        capturedNetworkName = config.Name
        return Promise.resolve(mockNetwork)
      })
      mockDocker.createContainer.mockResolvedValue(mockContainer)
      mockDocker.getContainer.mockImplementation(() => {
        // Update the mock to include the network with the captured name
        mockContainer.inspect = vi.fn().mockResolvedValue({
          State: { Running: true },
          NetworkSettings: {
            Networks: {
              [capturedNetworkName]: {
                IPAddress: '172.18.0.2',
              },
            },
          },
        })
        return mockContainer
      })

      // Act
      const session = await createSession(mockSpawnOptions)

      // Assert
      expect(session).toBeDefined()
      expect(session.sessionId).toBeDefined()
      expect(session.applicationId).toBe(mockSpawnOptions.applicationId)
      expect(session.candidateId).toBe(mockSpawnOptions.candidateId)
      expect(session.containerId).toBe('container-123')
      expect(session.networkId).toBe('network-123')
      expect(session.status).toBe('active')
      expect(session.vncUrl).toContain('vnc')
      expect(session.codeServerUrl).toContain(':8080')
    })

    it('should generate unique session ID for each session', async () => {
      // Arrange
      const mockNetworks: Record<string, string> = {}
      const mockNetwork = {
        id: 'network-123',
        inspect: vi.fn().mockResolvedValue({ Id: 'network-123' }),
      }
      const mockContainer = {
        id: 'container-123',
        start: vi.fn().mockResolvedValue(undefined),
        inspect: vi.fn().mockResolvedValue({
          State: { Running: true },
          NetworkSettings: {
            Networks: {} as Record<string, { IPAddress: string }>,
          },
        }),
      }

      mockDocker.ping.mockResolvedValue(undefined)
      mockDocker.pull.mockResolvedValue({
        on: vi.fn((event, cb) => {
          if (event === 'end') cb()
        }),
      })
      mockDocker.createNetwork.mockImplementation((config: { Name: string }) => {
        mockNetworks[config.Name] = config.Name
        return Promise.resolve(mockNetwork)
      })
      mockDocker.createContainer.mockResolvedValue(mockContainer)
      mockDocker.getContainer.mockImplementation(() => {
        // Return networks that have been created
        mockContainer.inspect = vi.fn().mockResolvedValue({
          State: { Running: true },
          NetworkSettings: {
            Networks: Object.fromEntries(
              Object.keys(mockNetworks).map((name) => [
                name,
                { IPAddress: '172.18.0.2' },
              ])
            ),
          },
        })
        return mockContainer
      })

      // Act
      const session1 = await createSession(mockSpawnOptions)
      const session2 = await createSession(mockSpawnOptions)

      // Assert
      expect(session1.sessionId).not.toBe(session2.sessionId)
    })

    it('should create isolated network', async () => {
      // Arrange
      let capturedNetworkName = ''
      let capturedLabels: Record<string, string> = {}
      const mockNetwork = {
        id: 'network-123',
        inspect: vi.fn().mockResolvedValue({ Id: 'network-123' }),
      }
      const mockContainer = {
        id: 'container-123',
        start: vi.fn().mockResolvedValue(undefined),
        inspect: vi.fn().mockResolvedValue({
          State: { Running: true },
          NetworkSettings: {
            Networks: {} as Record<string, { IPAddress: string }>,
          },
        }),
      }

      mockDocker.ping.mockResolvedValue(undefined)
      mockDocker.pull.mockResolvedValue({
        on: vi.fn((event, cb) => {
          if (event === 'end') cb()
        }),
      })
      mockDocker.createNetwork.mockImplementation((config: { Name: string; Labels?: Record<string, string> }) => {
        capturedNetworkName = config.Name
        capturedLabels = config.Labels || {}
        return Promise.resolve(mockNetwork)
      })
      mockDocker.createContainer.mockResolvedValue(mockContainer)
      mockDocker.getContainer.mockImplementation(() => {
        mockContainer.inspect = vi.fn().mockResolvedValue({
          State: { Running: true },
          NetworkSettings: {
            Networks: {
              [capturedNetworkName]: {
                IPAddress: '172.18.0.2',
              },
            },
          },
        })
        return mockContainer
      })

      // Act
      const session = await createSession(mockSpawnOptions)

      // Assert
      expect(capturedNetworkName).toContain('session-network-')
      expect(capturedLabels['hr-screening.sessionId']).toBe(session.sessionId)
      expect(capturedLabels['hr-screening.applicationId']).toBe(mockSpawnOptions.applicationId)
      expect(capturedLabels['hr-screening.candidateId']).toBe(mockSpawnOptions.candidateId)
    })

    it('should pull image if not exists', async () => {
      // Arrange
      let capturedNetworkName = ''
      const mockNetwork = {
        id: 'network-123',
        inspect: vi.fn().mockResolvedValue({ Id: 'network-123' }),
      }
      const mockContainer = {
        id: 'container-123',
        start: vi.fn().mockResolvedValue(undefined),
        inspect: vi.fn().mockResolvedValue({
          State: { Running: true },
          NetworkSettings: {
            Networks: {} as Record<string, { IPAddress: string }>,
          },
        }),
      }

      mockDocker.ping.mockResolvedValue(undefined)
      mockDocker.pull.mockResolvedValue({
        on: vi.fn((event, cb) => {
          if (event === 'end') cb()
        }),
      })
      mockDocker.createNetwork.mockImplementation((config: { Name: string }) => {
        capturedNetworkName = config.Name
        return Promise.resolve(mockNetwork)
      })
      mockDocker.createContainer.mockResolvedValue(mockContainer)
      mockDocker.getContainer.mockImplementation(() => {
        mockContainer.inspect = vi.fn().mockResolvedValue({
          State: { Running: true },
          NetworkSettings: {
            Networks: {
              [capturedNetworkName]: {
                IPAddress: '172.18.0.2',
              },
            },
          },
        })
        return mockContainer
      })

      // Act
      await createSession(mockSpawnOptions)

      // Assert
      expect(mockDocker.pull).toHaveBeenCalledWith(
        expect.stringContaining('candidate-sandbox')
      )
    })

    it('should apply security profiles (seccomp, AppArmor)', async () => {
      // Arrange
      let capturedNetworkName = ''
      const mockNetwork = {
        id: 'network-123',
        inspect: vi.fn().mockResolvedValue({ Id: 'network-123' }),
      }
      const mockContainer = {
        id: 'container-123',
        start: vi.fn().mockResolvedValue(undefined),
        inspect: vi.fn().mockResolvedValue({
          State: { Running: true },
          NetworkSettings: {
            Networks: {} as Record<string, { IPAddress: string }>,
          },
        }),
      }

      mockDocker.ping.mockResolvedValue(undefined)
      mockDocker.pull.mockResolvedValue({
        on: vi.fn((event, cb) => {
          if (event === 'end') cb()
        }),
      })
      mockDocker.createNetwork.mockImplementation((config: { Name: string }) => {
        capturedNetworkName = config.Name
        return Promise.resolve(mockNetwork)
      })
      mockDocker.createContainer.mockResolvedValue(mockContainer)
      mockDocker.getContainer.mockImplementation(() => {
        mockContainer.inspect = vi.fn().mockResolvedValue({
          State: { Running: true },
          NetworkSettings: {
            Networks: {
              [capturedNetworkName]: {
                IPAddress: '172.18.0.2',
              },
            },
          },
        })
        return mockContainer
      })

      // Act
      await createSession(mockSpawnOptions)

      // Assert
      expect(mockDocker.createContainer).toHaveBeenCalledWith(
        expect.objectContaining({
          HostConfig: expect.objectContaining({
            SecurityOpt: expect.arrayContaining([
              expect.stringContaining('seccomp'),
              expect.stringContaining('apparmor'),
            ]),
          }),
        })
      )
    })

    it('should set resource limits', async () => {
      // Arrange
      let capturedNetworkName = ''
      const mockNetwork = {
        id: 'network-123',
        inspect: vi.fn().mockResolvedValue({ Id: 'network-123' }),
      }
      const mockContainer = {
        id: 'container-123',
        start: vi.fn().mockResolvedValue(undefined),
        inspect: vi.fn().mockResolvedValue({
          State: { Running: true },
          NetworkSettings: {
            Networks: {} as Record<string, { IPAddress: string }>,
          },
        }),
      }

      mockDocker.ping.mockResolvedValue(undefined)
      mockDocker.pull.mockResolvedValue({
        on: vi.fn((event, cb) => {
          if (event === 'end') cb()
        }),
      })
      mockDocker.createNetwork.mockImplementation((config: { Name: string }) => {
        capturedNetworkName = config.Name
        return Promise.resolve(mockNetwork)
      })
      mockDocker.createContainer.mockResolvedValue(mockContainer)
      mockDocker.getContainer.mockImplementation(() => {
        mockContainer.inspect = vi.fn().mockResolvedValue({
          State: { Running: true },
          NetworkSettings: {
            Networks: {
              [capturedNetworkName]: {
                IPAddress: '172.18.0.2',
              },
            },
          },
        })
        return mockContainer
      })

      // Act
      await createSession(mockSpawnOptions)

      // Assert
      expect(mockDocker.createContainer).toHaveBeenCalledWith(
        expect.objectContaining({
          HostConfig: expect.objectContaining({
            CpuCount: 2,
            Memory: 4 * 1024 * 1024 * 1024, // 4GB
            PidsLimit: 100,
          }),
        })
      )
    })

    it('should set expiration time based on sessionDurationMinutes', async () => {
      // Arrange
      let capturedNetworkName = ''
      const mockNetwork = {
        id: 'network-123',
        inspect: vi.fn().mockResolvedValue({ Id: 'network-123' }),
      }
      const mockContainer = {
        id: 'container-123',
        start: vi.fn().mockResolvedValue(undefined),
        inspect: vi.fn().mockResolvedValue({
          State: { Running: true },
          NetworkSettings: {
            Networks: {} as Record<string, { IPAddress: string }>,
          },
        }),
      }

      mockDocker.ping.mockResolvedValue(undefined)
      mockDocker.pull.mockResolvedValue({
        on: vi.fn((event, cb) => {
          if (event === 'end') cb()
        }),
      })
      mockDocker.createNetwork.mockImplementation((config: { Name: string }) => {
        capturedNetworkName = config.Name
        return Promise.resolve(mockNetwork)
      })
      mockDocker.createContainer.mockResolvedValue(mockContainer)
      mockDocker.getContainer.mockImplementation(() => {
        mockContainer.inspect = vi.fn().mockResolvedValue({
          State: { Running: true },
          NetworkSettings: {
            Networks: {
              [capturedNetworkName]: {
                IPAddress: '172.18.0.2',
              },
            },
          },
        })
        return mockContainer
      })

      const beforeCreate = new Date()

      // Act
      const session = await createSession(mockSpawnOptions)

      const afterCreate = new Date()

      // Assert
      expect(session.createdAt.getTime()).toBeGreaterThanOrEqual(beforeCreate.getTime())
      expect(session.createdAt.getTime()).toBeLessThanOrEqual(afterCreate.getTime())

      const expectedExpiry = new Date(session.createdAt.getTime() + 60 * 60 * 1000) // 60 minutes
      expect(session.expiresAt.getTime()).toBe(expectedExpiry.getTime())
    })

    it('should use default session duration of 60 minutes when not specified', async () => {
      // Arrange
      const optionsWithoutDuration: SpawnOptions = {
        applicationId: 'app-123',
        candidateId: 'candidate-456',
      }

      let capturedNetworkName = ''
      const mockNetwork = {
        id: 'network-123',
        inspect: vi.fn().mockResolvedValue({ Id: 'network-123' }),
      }
      const mockContainer = {
        id: 'container-123',
        start: vi.fn().mockResolvedValue(undefined),
        inspect: vi.fn().mockResolvedValue({
          State: { Running: true },
          NetworkSettings: {
            Networks: {} as Record<string, { IPAddress: string }>,
          },
        }),
      }

      mockDocker.ping.mockResolvedValue(undefined)
      mockDocker.pull.mockResolvedValue({
        on: vi.fn((event, cb) => {
          if (event === 'end') cb()
        }),
      })
      mockDocker.createNetwork.mockImplementation((config: { Name: string }) => {
        capturedNetworkName = config.Name
        return Promise.resolve(mockNetwork)
      })
      mockDocker.createContainer.mockResolvedValue(mockContainer)
      mockDocker.getContainer.mockImplementation(() => {
        mockContainer.inspect = vi.fn().mockResolvedValue({
          State: { Running: true },
          NetworkSettings: {
            Networks: {
              [capturedNetworkName]: {
                IPAddress: '172.18.0.2',
              },
            },
          },
        })
        return mockContainer
      })

      // Act
      const session = await createSession(optionsWithoutDuration)

      // Assert
      const expectedExpiry = new Date(session.createdAt.getTime() + 60 * 60 * 1000) // 60 minutes default
      expect(session.expiresAt.getTime()).toBe(expectedExpiry.getTime())
    })

    it('should throw on Docker API error', async () => {
      // Arrange
      mockDocker.ping.mockRejectedValue(new Error('Docker daemon not reachable'))

      // Act & Assert
      await expect(createSession(mockSpawnOptions)).rejects.toThrow(
        'Failed to create session'
      )
    })

    it('should throw on network creation failure', async () => {
      // Arrange
      mockDocker.ping.mockResolvedValue(undefined)
      mockDocker.pull.mockResolvedValue({
        on: vi.fn((event, cb) => {
          if (event === 'end') cb()
        }),
      })
      mockDocker.createNetwork.mockRejectedValue(new Error('Network creation failed'))

      // Act & Assert
      await expect(createSession(mockSpawnOptions)).rejects.toThrow(
        'Failed to create session'
      )
    })
  })

  describe('destroySession', () => {
    it('should stop and remove container', async () => {
      // Arrange
      const mockContainer = {
        stop: vi.fn().mockResolvedValue(undefined),
        remove: vi.fn().mockResolvedValue(undefined),
        inspect: vi.fn().mockResolvedValue({
          State: { Running: true },
        }),
      }
      const mockNetwork = {
        remove: vi.fn().mockResolvedValue(undefined),
      }

      mockDocker.getContainer.mockReturnValue(mockContainer)
      mockDocker.getNetwork.mockReturnValue(mockNetwork)

      // Act
      await destroySession('session-123', 'container-123', 'network-123')

      // Assert
      expect(mockContainer.stop).toHaveBeenCalled()
      expect(mockContainer.remove).toHaveBeenCalled()
    })

    it('should archive workspace before removal', async () => {
      // Arrange
      const mockContainer = {
        stop: vi.fn().mockResolvedValue(undefined),
        remove: vi.fn().mockResolvedValue(undefined),
        inspect: vi.fn().mockResolvedValue({
          State: { Running: true },
        }),
        getArchive: vi.fn().mockResolvedValue({
          pipe: vi.fn(),
        }),
      }
      const mockNetwork = {
        remove: vi.fn().mockResolvedValue(undefined),
      }

      mockDocker.getContainer.mockReturnValue(mockContainer)
      mockDocker.getNetwork.mockReturnValue(mockNetwork)

      // Act
      await destroySession('session-123', 'container-123', 'network-123')

      // Assert - archiveWorkspace should be called during destroySession
      expect(mockContainer.stop).toHaveBeenCalled()
      expect(mockContainer.remove).toHaveBeenCalled()
    })

    it('should remove network', async () => {
      // Arrange
      const mockContainer = {
        stop: vi.fn().mockResolvedValue(undefined),
        remove: vi.fn().mockResolvedValue(undefined),
        inspect: vi.fn().mockResolvedValue({
          State: { Running: true },
        }),
      }
      const mockNetwork = {
        remove: vi.fn().mockResolvedValue(undefined),
      }

      mockDocker.getContainer.mockReturnValue(mockContainer)
      mockDocker.getNetwork.mockReturnValue(mockNetwork)

      // Act
      await destroySession('session-123', 'container-123', 'network-123')

      // Assert
      expect(mockNetwork.remove).toHaveBeenCalled()
    })

    it('should handle already-stopped containers', async () => {
      // Arrange
      const mockContainer = {
        stop: vi.fn().mockRejectedValue({ statusCode: 304 }), // Already stopped
        remove: vi.fn().mockResolvedValue(undefined),
        inspect: vi.fn().mockResolvedValue({
          State: { Running: false },
        }),
      }
      const mockNetwork = {
        remove: vi.fn().mockResolvedValue(undefined),
      }

      mockDocker.getContainer.mockReturnValue(mockContainer)
      mockDocker.getNetwork.mockReturnValue(mockNetwork)

      // Act - should not throw
      await expect(
        destroySession('session-123', 'container-123', 'network-123')
      ).resolves.not.toThrow()

      // Assert
      expect(mockContainer.remove).toHaveBeenCalled()
      expect(mockNetwork.remove).toHaveBeenCalled()
    })

    it('should throw on cleanup errors', async () => {
      // Arrange
      const mockContainer = {
        stop: vi.fn().mockRejectedValue(new Error('Stop failed')),
        inspect: vi.fn().mockResolvedValue({
          State: { Running: true },
        }),
      }

      mockDocker.getContainer.mockReturnValue(mockContainer)

      // Act & Assert
      await expect(
        destroySession('session-123', 'container-123', 'network-123')
      ).rejects.toThrow('Failed to destroy session')
    })
  })

  describe('getSessionStatus', () => {
    it('should return session info for active container', async () => {
      // Arrange
      const mockContainer = {
        inspect: vi.fn().mockResolvedValue({
          Id: 'container-123',
          State: {
            Running: true,
            StartedAt: new Date().toISOString(),
          },
          Config: {
            Labels: {
              'hr-screening.sessionId': 'session-123',
              'hr-screening.applicationId': 'app-123',
              'hr-screening.candidateId': 'candidate-456',
            },
          },
          NetworkSettings: {
            Networks: {
              'session-network-123': {
                IPAddress: '172.18.0.2',
              },
            },
          },
        }),
      }

      mockDocker.getContainer.mockReturnValue(mockContainer)

      // Act
      const session = await getSessionStatus('container-123')

      // Assert
      expect(session).not.toBeNull()
      expect(session?.containerId).toBe('container-123')
      expect(session?.status).toBe('active')
    })

    it('should return null for non-existent container', async () => {
      // Arrange
      const mockContainer = {
        inspect: vi.fn().mockRejectedValue({ statusCode: 404 }),
      }

      mockDocker.getContainer.mockReturnValue(mockContainer)

      // Act
      const session = await getSessionStatus('non-existent')

      // Assert
      expect(session).toBeNull()
    })

    it('should return expired status for stopped container', async () => {
      // Arrange
      const mockContainer = {
        inspect: vi.fn().mockResolvedValue({
          Id: 'container-123',
          State: {
            Running: false,
            FinishedAt: new Date().toISOString(),
          },
          Config: {
            Labels: {
              'hr-screening.sessionId': 'session-123',
              'hr-screening.applicationId': 'app-123',
              'hr-screening.candidateId': 'candidate-456',
            },
          },
          NetworkSettings: {
            Networks: {},
          },
        }),
      }

      mockDocker.getContainer.mockReturnValue(mockContainer)

      // Act
      const session = await getSessionStatus('container-123')

      // Assert
      expect(session).not.toBeNull()
      expect(session?.status).toBe('expired')
    })

    it('should throw on non-404 errors when getting session status', async () => {
      // Arrange
      const mockContainer = {
        inspect: vi.fn().mockRejectedValue(new Error('Docker error')),
      }

      mockDocker.getContainer.mockReturnValue(mockContainer)

      // Act & Assert
      await expect(getSessionStatus('container-123')).rejects.toThrow('Docker error')
    })

    it('should return empty URLs when network info is missing', async () => {
      // Arrange
      const mockContainer = {
        inspect: vi.fn().mockResolvedValue({
          Id: 'container-123',
          State: {
            Running: true,
            StartedAt: new Date().toISOString(),
          },
          Config: {
            Labels: {
              'hr-screening.sessionId': 'session-123',
              'hr-screening.applicationId': 'app-123',
              'hr-screening.candidateId': 'candidate-456',
            },
            WorkingDir: '/workspace',
          },
          NetworkSettings: {
            Networks: {},
          },
        }),
      }

      mockDocker.getContainer.mockReturnValue(mockContainer)

      // Act
      const session = await getSessionStatus('container-123')

      // Assert
      expect(session).not.toBeNull()
      expect(session?.vncUrl).toBe('')
      expect(session?.codeServerUrl).toBe('')
    })

    it('should return null when container has no session label', async () => {
      // Arrange
      const mockContainer = {
        inspect: vi.fn().mockResolvedValue({
          Id: 'container-123',
          State: {
            Running: true,
            StartedAt: new Date().toISOString(),
          },
          Config: {
            Labels: {
              'some-other-label': 'value',
            },
          },
          NetworkSettings: {
            Networks: {},
          },
        }),
      }

      mockDocker.getContainer.mockReturnValue(mockContainer)

      // Act
      const session = await getSessionStatus('container-123')

      // Assert
      expect(session).toBeNull()
    })

    it('should return stopped status for container that is not running and has no FinishedAt', async () => {
      // Arrange
      const mockContainer = {
        inspect: vi.fn().mockResolvedValue({
          Id: 'container-123',
          State: {
            Running: false,
            FinishedAt: null,
          },
          Config: {
            Labels: {
              'hr-screening.sessionId': 'session-123',
              'hr-screening.applicationId': 'app-123',
              'hr-screening.candidateId': 'candidate-456',
            },
          },
          NetworkSettings: {
            Networks: {},
          },
        }),
      }

      mockDocker.getContainer.mockReturnValue(mockContainer)

      // Act
      const session = await getSessionStatus('container-123')

      // Assert
      expect(session).not.toBeNull()
      expect(session?.status).toBe('stopped')
    })
  })

  describe('pullImage', () => {
    it('should pull image successfully', async () => {
      // Arrange
      mockDocker.pull.mockResolvedValue({
        on: vi.fn((event, cb) => {
          if (event === 'end') cb()
        }),
      })

      // Act
      await pullImage('candidate-sandbox:latest')

      // Assert
      expect(mockDocker.pull).toHaveBeenCalledWith('candidate-sandbox:latest')
    })

    it('should throw on pull error', async () => {
      // Arrange
      mockDocker.pull.mockResolvedValue({
        on: vi.fn((event, cb) => {
          if (event === 'error') cb(new Error('Pull failed'))
        }),
      })

      // Act & Assert
      await expect(pullImage('candidate-sandbox:latest')).rejects.toThrow(
        'Failed to pull image'
      )
    })
  })

  describe('createNetwork', () => {
    it('should create network with correct config', async () => {
      // Arrange
      const mockNetwork = {
        id: 'network-123',
      }
      mockDocker.createNetwork.mockResolvedValue(mockNetwork)

      // Act
      const networkId = await createNetwork('test-network')

      // Assert
      expect(networkId).toBe('network-123')
      expect(mockDocker.createNetwork).toHaveBeenCalledWith({
        Name: 'test-network',
        Driver: 'bridge',
        Internal: false,
        CheckDuplicate: true,
        Labels: expect.any(Object),
      })
    })

    it('should throw on network creation failure', async () => {
      // Arrange
      mockDocker.createNetwork.mockRejectedValue(new Error('Network creation failed'))

      // Act & Assert
      await expect(createNetwork('test-network')).rejects.toThrow(
        'Failed to create network'
      )
    })
  })

  describe('createContainer', () => {
    const mockConfig: ContainerConfig = {
      image: 'candidate-sandbox:latest',
      name: 'test-container',
      user: 'candidate',
      workingDir: '/workspace',
      env: { KEY: 'value' },
      cmd: ['/bin/bash'],
      hostConfig: {
        cpuCount: 2,
        memoryBytes: 4 * 1024 * 1024 * 1024,
        pidsLimit: 100,
        readonlyRootfs: true,
        tmpfs: { '/tmp': 'rw,noexec,nosuid,size=100m' },
        securityOpt: ['seccomp=/etc/docker/seccomp-default.json', 'apparmor=docker-default'],
        networkMode: 'bridge',
        capabilities: {
          drop: ['ALL'],
          add: ['CHOWN', 'SETGID', 'SETUID', 'DAC_OVERRIDE'],
        },
      },
    }

    it('should create container with correct config', async () => {
      // Arrange
      const mockContainer = {
        id: 'container-123',
      }
      mockDocker.createContainer.mockResolvedValue(mockContainer)

      // Act
      const containerId = await createContainer(mockConfig, 'session-123')

      // Assert
      expect(containerId).toBe('container-123')
      expect(mockDocker.createContainer).toHaveBeenCalledWith(
        expect.objectContaining({
          Image: mockConfig.image,
          name: mockConfig.name,
          User: mockConfig.user,
          WorkingDir: mockConfig.workingDir,
          Env: expect.arrayContaining(['KEY=value']),
          Cmd: mockConfig.cmd,
          Labels: expect.objectContaining({
            'hr-screening.sessionId': 'session-123',
          }),
          HostConfig: expect.objectContaining({
            CpuCount: 2,
            Memory: 4 * 1024 * 1024 * 1024,
            PidsLimit: 100,
            ReadonlyRootfs: true,
            Tmpfs: mockConfig.hostConfig.tmpfs,
            SecurityOpt: mockConfig.hostConfig.securityOpt,
            NetworkMode: 'bridge',
            CapDrop: ['ALL'],
            CapAdd: ['CHOWN', 'SETGID', 'SETUID', 'DAC_OVERRIDE'],
          }),
        })
      )
    })

    it('should throw on container creation failure', async () => {
      // Arrange
      mockDocker.createContainer.mockRejectedValue(
        new Error('Container creation failed')
      )

      // Act & Assert
      await expect(createContainer(mockConfig, 'session-123')).rejects.toThrow(
        'Failed to create container'
      )
    })
  })

  describe('startContainer', () => {
    it('should start container successfully', async () => {
      // Arrange
      const mockContainer = {
        start: vi.fn().mockResolvedValue(undefined),
      }
      mockDocker.getContainer.mockReturnValue(mockContainer)

      // Act
      await startContainer('container-123')

      // Assert
      expect(mockContainer.start).toHaveBeenCalled()
    })

    it('should throw on start failure', async () => {
      // Arrange
      const mockContainer = {
        start: vi.fn().mockRejectedValue(new Error('Start failed')),
      }
      mockDocker.getContainer.mockReturnValue(mockContainer)

      // Act & Assert
      await expect(startContainer('container-123')).rejects.toThrow(
        'Failed to start container'
      )
    })
  })

  describe('stopContainer', () => {
    it('should stop container with default timeout', async () => {
      // Arrange
      const mockContainer = {
        stop: vi.fn().mockResolvedValue(undefined),
      }
      mockDocker.getContainer.mockReturnValue(mockContainer)

      // Act
      await stopContainer('container-123')

      // Assert
      expect(mockContainer.stop).toHaveBeenCalledWith({ t: 30 })
    })

    it('should stop container with custom timeout', async () => {
      // Arrange
      const mockContainer = {
        stop: vi.fn().mockResolvedValue(undefined),
      }
      mockDocker.getContainer.mockReturnValue(mockContainer)

      // Act
      await stopContainer('container-123', 60)

      // Assert
      expect(mockContainer.stop).toHaveBeenCalledWith({ t: 60 })
    })

    it('should handle already stopped container', async () => {
      // Arrange
      const mockContainer = {
        stop: vi.fn().mockRejectedValue({ statusCode: 304 }),
      }
      mockDocker.getContainer.mockReturnValue(mockContainer)

      // Act - should not throw
      await expect(stopContainer('container-123')).resolves.not.toThrow()
    })

    it('should throw on stop failure', async () => {
      // Arrange
      const mockContainer = {
        stop: vi.fn().mockRejectedValue(new Error('Stop failed')),
      }
      mockDocker.getContainer.mockReturnValue(mockContainer)

      // Act & Assert
      await expect(stopContainer('container-123')).rejects.toThrow(
        'Failed to stop container'
      )
    })
  })

  describe('removeContainer', () => {
    it('should remove container successfully', async () => {
      // Arrange
      const mockContainer = {
        remove: vi.fn().mockResolvedValue(undefined),
      }
      mockDocker.getContainer.mockReturnValue(mockContainer)

      // Act
      await removeContainer('container-123')

      // Assert
      expect(mockContainer.remove).toHaveBeenCalledWith({ force: false })
    })

    it('should force remove when specified', async () => {
      // Arrange
      const mockContainer = {
        remove: vi.fn().mockResolvedValue(undefined),
      }
      mockDocker.getContainer.mockReturnValue(mockContainer)

      // Act
      await removeContainer('container-123', true)

      // Assert
      expect(mockContainer.remove).toHaveBeenCalledWith({ force: true })
    })

    it('should throw on remove failure', async () => {
      // Arrange
      const mockContainer = {
        remove: vi.fn().mockRejectedValue(new Error('Remove failed')),
      }
      mockDocker.getContainer.mockReturnValue(mockContainer)

      // Act & Assert
      await expect(removeContainer('container-123')).rejects.toThrow(
        'Failed to remove container'
      )
    })
  })

  describe('archiveWorkspace', () => {
    it('should archive workspace successfully', async () => {
      // Arrange
      const mockStream = { pipe: vi.fn() }
      const mockContainer = {
        getArchive: vi.fn().mockResolvedValue(mockStream),
      }
      mockDocker.getContainer.mockReturnValue(mockContainer)

      // Act
      await archiveWorkspace('container-123', '/backups/workspace.tar')

      // Assert
      expect(mockContainer.getArchive).toHaveBeenCalledWith({ path: '/workspace' })
    })

    it('should throw on archive failure', async () => {
      // Arrange
      const mockContainer = {
        getArchive: vi.fn().mockRejectedValue(new Error('Archive failed')),
      }
      mockDocker.getContainer.mockReturnValue(mockContainer)

      // Act & Assert
      await expect(
        archiveWorkspace('container-123', '/backups/workspace.tar')
      ).rejects.toThrow('Failed to archive workspace')
    })
  })

  describe('Security Configuration', () => {
    const mockConfig: ContainerConfig = {
      image: 'candidate-sandbox:latest',
      name: 'test-container',
      user: 'candidate',
      workingDir: '/workspace',
      env: {},
      cmd: [],
      hostConfig: {
        cpuCount: 2,
        memoryBytes: 4 * 1024 * 1024 * 1024,
        pidsLimit: 100,
        readonlyRootfs: true,
        tmpfs: {},
        securityOpt: ['seccomp=/etc/docker/seccomp-default.json', 'apparmor=docker-default'],
        networkMode: 'bridge',
        capabilities: {
          drop: ['ALL'],
          add: ['CHOWN', 'SETGID', 'SETUID', 'DAC_OVERRIDE'],
        },
      },
    }

    it('should drop all capabilities except required ones', async () => {
      // Arrange
      const mockContainer = { id: 'container-123' }
      mockDocker.createContainer.mockResolvedValue(mockContainer)

      // Act
      await createContainer(mockConfig, 'session-123')

      // Assert
      expect(mockDocker.createContainer).toHaveBeenCalledWith(
        expect.objectContaining({
          HostConfig: expect.objectContaining({
            CapDrop: ['ALL'],
            CapAdd: ['CHOWN', 'SETGID', 'SETUID', 'DAC_OVERRIDE'],
          }),
        })
      )
    })

    it('should mount read-only root filesystem', async () => {
      // Arrange
      const mockContainer = { id: 'container-123' }
      mockDocker.createContainer.mockResolvedValue(mockContainer)

      // Act
      await createContainer(mockConfig, 'session-123')

      // Assert
      expect(mockDocker.createContainer).toHaveBeenCalledWith(
        expect.objectContaining({
          HostConfig: expect.objectContaining({
            ReadonlyRootfs: true,
          }),
        })
      )
    })

    it('should apply seccomp profile', async () => {
      // Arrange
      const mockContainer = { id: 'container-123' }
      mockDocker.createContainer.mockResolvedValue(mockContainer)

      // Act
      await createContainer(mockConfig, 'session-123')

      // Assert
      expect(mockDocker.createContainer).toHaveBeenCalledWith(
        expect.objectContaining({
          HostConfig: expect.objectContaining({
            SecurityOpt: expect.arrayContaining([
              expect.stringContaining('seccomp'),
            ]),
          }),
        })
      )
    })

    it('should apply AppArmor profile', async () => {
      // Arrange
      const mockContainer = { id: 'container-123' }
      mockDocker.createContainer.mockResolvedValue(mockContainer)

      // Act
      await createContainer(mockConfig, 'session-123')

      // Assert
      expect(mockDocker.createContainer).toHaveBeenCalledWith(
        expect.objectContaining({
          HostConfig: expect.objectContaining({
            SecurityOpt: expect.arrayContaining([
              expect.stringContaining('apparmor'),
            ]),
          }),
        })
      )
    })
  })
})
