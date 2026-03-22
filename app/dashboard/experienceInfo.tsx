import { ExperienceInfo } from "@/components/userInfo/experience";
import { useUserInfo as getUserInfo } from "@/hooks/useUserInfo";

export const ExperienceInfoServer = async () => {
  const userInfo = await getUserInfo();
  return (
    <>
      <ExperienceInfo initialInfo={userInfo} />
    </>
  );
};
