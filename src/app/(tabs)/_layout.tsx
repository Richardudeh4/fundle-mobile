
import { Tabs } from "expo-router";
import { NativeTabs } from "expo-router/build/native-tabs";

export default function TabsLayout() {
  return (
    <NativeTabs
  tintColor="#0A84FF"
  iconColor="#8E8E93"        
  labelStyle={{ color: "#8E8E93" }}  
  backgroundColor="#ffffff"  
    >
    <NativeTabs.Trigger name="index">
         <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="house.fill" md="home" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="Loan">
    <NativeTabs.Trigger.Label>Loan</NativeTabs.Trigger.Label>
    <NativeTabs.Trigger.Icon sf="banknote.fill" md="account_balance" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="Repay">
    <NativeTabs.Trigger.Label>Repay</NativeTabs.Trigger.Label>
    <NativeTabs.Trigger.Icon sf="creditcard.fill" md="payments" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="Settings">
    <NativeTabs.Trigger.Label>Settings</NativeTabs.Trigger.Label>
    <NativeTabs.Trigger.Icon sf="gearshape.fill" md="settings" />
      </NativeTabs.Trigger>

    </NativeTabs>
  )
}