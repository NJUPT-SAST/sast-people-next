import { toPeopleUserFromLinkAdminItem } from "@/lib/link/people-user";
import type { LinkAdminUserItem } from "@/lib/link/types";

const linkAdminUser: LinkAdminUserItem = {
  id: 42,
  name: "Link User",
  student_id: "B260042",
  login_email: "link-user@njupt.edu.cn",
  phone_number: "13800000042",
  qq_number: "420000",
  role: "freshman",
  state: "njupter",
  email_type: "njupt_email",
  department: "software",
  college: "计算机学院、软件学院、网络空间安全学院",
  major: "软件工程",
  created_at: "2026-06-04T03:51:35.694Z",
};

describe("Link user mapping", () => {
  it("maps v3.1 admin list fields into the People user model", () => {
    const user = toPeopleUserFromLinkAdminItem(linkAdminUser, true);

    expect(user).toMatchObject({
      id: 42,
      name: "Link User",
      studentId: "B260042",
      email: "link-user@njupt.edu.cn",
      phone: "13800000042",
      qq: "420000",
      emailType: "njupt_email",
      linkState: "njupter",
      college: "计算机学院、软件学院、网络空间安全学院",
      major: "软件工程",
      departments: ["software"],
      role: 0,
      isDeleted: false,
    });
  });

  it("hides sensitive fields when not allowed", () => {
    const user = toPeopleUserFromLinkAdminItem(linkAdminUser, false);

    expect(user.phone).toBeNull();
    expect(user.qq).toBeNull();
  });
  it("maps an omitted phone number to null", () => {
    const { phone_number: _phoneNumber, ...withoutPhoneNumber } = linkAdminUser;
    const user = toPeopleUserFromLinkAdminItem(withoutPhoneNumber, true);

    expect(user.phone).toBeNull();
  });
});
