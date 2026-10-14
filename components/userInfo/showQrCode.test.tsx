import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { ShowQrCode } from "./showQrCode"

let qrValue: string | undefined

jest.mock("react-qr-code", () => ({
  __esModule: true,
  default: ({ value }: { value: string }) => {
    qrValue = value
    return <div data-testid="qr" />
  },
}))

describe("ShowQrCode", () => {
  it("keeps the dialog description text-only", async () => {
    const user = userEvent.setup()
    const consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined)

    render(<ShowQrCode uid={123} />)

    await user.click(screen.getByRole("button", { name: "身份码" }))

    const description = screen.getByText(
      "请勿将此二维码分享给他人，请在批改试卷时展示给讲师"
    )

    expect(description.tagName).toBe("P")
    expect(description.querySelector("div")).toBeNull()
    expect(description.querySelector("p")).toBeNull()
    expect(consoleErrorSpy).not.toHaveBeenCalled()

    consoleErrorSpy.mockRestore()
  })

  it("encodes the uid as a number so scanners can parse it", async () => {
    const user = userEvent.setup()

    render(<ShowQrCode uid={123} />)

    await user.click(screen.getByRole("button", { name: "身份码" }))

    expect(JSON.parse(atob(qrValue ?? ""))).toMatchObject({ uid: 123 })
  })
})
