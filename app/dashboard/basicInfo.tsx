import { BasicInfo } from "@/components/userInfo/basic";
import { useUserInfo as getUserInfo } from "@/hooks/useUserInfo";

export const BasicInfoServer = async () => {
  const userInfo = await getUserInfo();
  return (
    <>
      <BasicInfo initialInfo={userInfo} />
    </>
  );
};
