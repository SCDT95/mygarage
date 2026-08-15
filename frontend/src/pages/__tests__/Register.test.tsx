import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { render } from '../../__tests__/test-utils'

// Bypass AuthProvider by mocking the hook directly, same pattern as Login.test.tsx.
const registerMock = vi.fn()
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    register: registerMock,
    user: null,
  }),
}))

// Mock axios so the api module (imported directly by Register for the
// /auth/users/count first-user check) doesn't error out on import.
vi.mock('axios', () => {
  interface MockAxios {
    post: ReturnType<typeof vi.fn>
    get: ReturnType<typeof vi.fn>
    interceptors: {
      request: { use: ReturnType<typeof vi.fn>; eject: ReturnType<typeof vi.fn> }
      response: { use: ReturnType<typeof vi.fn>; eject: ReturnType<typeof vi.fn> }
    }
    create: ReturnType<typeof vi.fn>
  }
  const mockAxios: MockAxios = {
    post: vi.fn(() => Promise.resolve({ data: {} })),
    get: vi.fn(() => Promise.resolve({ data: { count: 1 } })),
    interceptors: {
      request: { use: vi.fn(), eject: vi.fn() },
      response: { use: vi.fn(), eject: vi.fn() },
    },
    create: vi.fn(),
  }
  mockAxios.create = vi.fn(() => mockAxios)
  return { default: mockAxios }
})

import Register from '../Register'

beforeEach(() => {
  registerMock.mockClear()
})

afterEach(() => {
  cleanup()
})

async function fillValidForm(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  // Values chosen to pass client-side zod validation (makeRegisterSchema) so
  // handleSubmit actually calls onSubmit and reaches registerMock — the
  // 422 being tested is a server-side rule the client mirrors but a real
  // deployment could still reject (e.g. a rule added backend-only).
  await user.type(screen.getByLabelText('register.username'), 'newuser1')
  await user.type(screen.getByLabelText('register.email'), 'newuser1@example.com')
  await user.type(screen.getByLabelText('register.password'), 'Passw0rd!')
  await user.type(screen.getByLabelText('registerPage.confirmPasswordLabel'), 'Passw0rd!')
}

// Regression fence for the AuthContext bug found in Task 10c review: AuthContext
// used to catch the AxiosError from POST /auth/register, collapse it to
// `new Error(response.data.detail || ...)`, and re-throw. On a 422, `detail` is
// an ARRAY of problem objects (FastAPI's validation-error shape), so the array
// was truthy and `new Error(array)` stringified it — the user saw literal
// "[object Object],[object Object]" text, and applyServerErrors' fieldErrors
// path was permanently dead (parseApiError only populates fieldErrors from a
// real AxiosError, which no longer existed by the time Register.tsx caught it).
describe('Register — server-side 422 field-error wiring (Task 10c regression fence)', () => {
  it('a weak-password 422 attaches its message to the password field, not a generic banner or [object Object]', async () => {
    registerMock.mockRejectedValueOnce({
      isAxiosError: true,
      message: 'Request failed with status code 422',
      response: {
        status: 422,
        data: {
          detail: [
            {
              type: 'value_error',
              loc: ['body', 'password'],
              msg: 'Password must contain at least one special character',
            },
          ],
        },
      },
    })

    const user = userEvent.setup()
    render(<Register />)

    await fillValidForm(user)
    await user.click(screen.getByRole('button', { name: 'register.submit' }))

    await waitFor(() => expect(registerMock).toHaveBeenCalledTimes(1))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Password must contain at least one special character')

    // The generic action-failure banner must NOT also appear — the problem
    // fully attached to a known field, so Register's `attached.length === 0
    // || unhandled.length > 0` guard should stay false.
    expect(screen.queryByText(/registerPage\.createAccountAction/)).not.toBeInTheDocument()

    // The actual bug: an array `detail` reaching String()/template coercion
    // anywhere in the pipeline.
    expect(document.body.textContent).not.toContain('[object Object]')
  })

  it('confirms the field-error path is reachable at all — fails on the pre-fix AuthContext behavior', async () => {
    // Same rejection, but this test exists purely to prove the assertion above
    // isn't vacuously true. If AuthContext still collapsed the error to a
    // plain Error (pre-fix), applyServerErrors would find fieldErrors === []
    // (parseApiError only parses a real AxiosError), no alert role would ever
    // render, and this findByRole would time out and fail — which is what
    // happened when this test was run against the pre-fix AuthContext.
    registerMock.mockRejectedValueOnce({
      isAxiosError: true,
      message: 'Request failed with status code 422',
      response: {
        status: 422,
        data: {
          detail: [
            { type: 'value_error', loc: ['body', 'password'], msg: 'Too weak' },
          ],
        },
      },
    })

    const user = userEvent.setup()
    render(<Register />)

    await fillValidForm(user)
    await user.click(screen.getByRole('button', { name: 'register.submit' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Too weak')
  })
})
