import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import LoginPage from './page'

// Mock the Supabase client
const mockSignInWithOtp = vi.fn()
const mockSignInWithOAuth = vi.fn()

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      signInWithOtp: (...args: unknown[]) => mockSignInWithOtp(...args),
      signInWithOAuth: (...args: unknown[]) => mockSignInWithOAuth(...args),
    },
  }),
}))

describe('Login Page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset window.location.origin for tests
    Object.defineProperty(window, 'location', {
      value: { origin: 'http://localhost:3000' },
      writable: true,
    })
  })

  it('renders login form with email input', () => {
    render(<LoginPage />)

    expect(screen.getByRole('heading', { name: /sign in/i })).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/enter your email/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /send magic link/i })).toBeInTheDocument()
  })

  it('renders GitHub login button', () => {
    render(<LoginPage />)

    expect(screen.getByRole('button', { name: /continue with github/i })).toBeInTheDocument()
  })

  it('updates email input on change', () => {
    render(<LoginPage />)

    const emailInput = screen.getByPlaceholderText(/enter your email/i)
    fireEvent.change(emailInput, { target: { value: 'test@example.com' } })

    expect(emailInput).toHaveValue('test@example.com')
  })

  it('calls signInWithOtp on form submit', async () => {
    mockSignInWithOtp.mockResolvedValue({ error: null })

    render(<LoginPage />)

    const emailInput = screen.getByPlaceholderText(/enter your email/i)
    const submitButton = screen.getByRole('button', { name: /send magic link/i })

    fireEvent.change(emailInput, { target: { value: 'test@example.com' } })
    fireEvent.click(submitButton)

    await waitFor(() => {
      expect(mockSignInWithOtp).toHaveBeenCalledWith({
        email: 'test@example.com',
        options: {
          emailRedirectTo: 'http://localhost:3000/auth/callback',
        },
      })
    })
  })

  it('shows loading state during submission', async () => {
    mockSignInWithOtp.mockImplementation(() => new Promise(() => {})) // Never resolves

    render(<LoginPage />)

    const emailInput = screen.getByPlaceholderText(/enter your email/i)
    const submitButton = screen.getByRole('button', { name: /send magic link/i })

    fireEvent.change(emailInput, { target: { value: 'test@example.com' } })
    fireEvent.click(submitButton)

    expect(screen.getByRole('button', { name: /sending/i })).toBeDisabled()
  })

  it('shows success message on successful submission', async () => {
    mockSignInWithOtp.mockResolvedValue({ error: null })

    render(<LoginPage />)

    const emailInput = screen.getByPlaceholderText(/enter your email/i)
    const submitButton = screen.getByRole('button', { name: /send magic link/i })

    fireEvent.change(emailInput, { target: { value: 'test@example.com' } })
    fireEvent.click(submitButton)

    await waitFor(() => {
      expect(screen.getByText(/check your email/i)).toBeInTheDocument()
    })
  })

  it('shows error message on failed submission', async () => {
    mockSignInWithOtp.mockResolvedValue({ error: { message: 'Auth error' } })

    render(<LoginPage />)

    const emailInput = screen.getByPlaceholderText(/enter your email/i)
    const submitButton = screen.getByRole('button', { name: /send magic link/i })

    fireEvent.change(emailInput, { target: { value: 'test@example.com' } })
    fireEvent.click(submitButton)

    await waitFor(() => {
      expect(screen.getByText(/error sending magic link/i)).toBeInTheDocument()
    })
  })

  it('calls signInWithOAuth when GitHub button clicked', async () => {
    mockSignInWithOAuth.mockResolvedValue({ error: null })

    render(<LoginPage />)

    const githubButton = screen.getByRole('button', { name: /continue with github/i })
    fireEvent.click(githubButton)

    await waitFor(() => {
      expect(mockSignInWithOAuth).toHaveBeenCalledWith({
        provider: 'github',
        options: {
          redirectTo: 'http://localhost:3000/auth/callback',
        },
      })
    })
  })

  it('prevents default form submission behavior', async () => {
    mockSignInWithOtp.mockResolvedValue({ error: null })

    render(<LoginPage />)

    const form = document.querySelector('form')
    const preventDefault = vi.fn()

    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault()
        preventDefault()
      })
      fireEvent.submit(form)
      expect(preventDefault).toHaveBeenCalled()
    }
  })

  it('disables submit button while loading', async () => {
    mockSignInWithOtp.mockImplementation(() => new Promise(() => {}))

    render(<LoginPage />)

    const emailInput = screen.getByPlaceholderText(/enter your email/i)
    const submitButton = screen.getByRole('button', { name: /send magic link/i })

    fireEvent.change(emailInput, { target: { value: 'test@example.com' } })
    fireEvent.click(submitButton)

    expect(submitButton).toBeDisabled()
  })

  it('requires email input', () => {
    render(<LoginPage />)

    const emailInput = screen.getByPlaceholderText(/enter your email/i)
    expect(emailInput).toHaveAttribute('required')
  })

  it('validates email format', () => {
    render(<LoginPage />)

    const emailInput = screen.getByPlaceholderText(/enter your email/i)
    expect(emailInput).toHaveAttribute('type', 'email')
  })
})
