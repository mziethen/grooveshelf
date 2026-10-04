exports.openNavigation=async page=>{const toggle=page.locator('#nav-toggle');if(await toggle.isVisible()&&await toggle.getAttribute('aria-expanded')==='false')await toggle.click();};
