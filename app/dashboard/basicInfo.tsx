import { BasicInfo } from "@/components/userInfo/basic";
import { useUserInfo as getUserInfo } from "@/hooks/useUserInfo";

export const BasicInfoServer = async ({ embedded = false }: { embedded?: boolean } = {}) => {
  const userInfo = await getUserInfo();
  return (
    <>
      <BasicInfo initialInfo={userInfo} embedded={embedded} />
    </>
  );
};
