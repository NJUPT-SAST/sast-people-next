import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { ShowQrCode } from "./showQrCode"

describe("ShowQrCode", () => {
  it("keeps the dialog description text-only", async () => {
    const user = userEvent.setup()
    const consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined)

    render(<ShowQrCode uid="123" />)

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
})
