document.addEventListener('DOMContentLoaded', () => {
  const toggleBtn = document.getElementById("toggleAddCompany");
  const companyForm = document.getElementById("companyInputs");
  const saveBtn = document.getElementById("saveCompany");
  const output = document.getElementById("jobList");
  const checkBtn = document.getElementById("checkBtn");
  const buttonContainer = document.getElementById("buttonContainer");
  const resultDiv = document.getElementById("result");
  const card = document.querySelector(".card");

  if (buttonContainer && toggleBtn && checkBtn) {
    buttonContainer.appendChild(toggleBtn);
  }

  toggleBtn.addEventListener("click", () => {
    companyForm.classList.toggle("active");
  });

  saveBtn.addEventListener("click", () => {
    const name = document.getElementById("companyName").value.trim();
    const url = document.getElementById("companyUrl").value.trim();
    const className = document.getElementById("className").value.trim();

    if (!name || !url || !className) {
      alert("Please fill in all fields.");
      return;
    }

    chrome.storage.local.get({ companies: [] }, (result) => {
      const updated = [...result.companies, { name, url, className }];
      chrome.storage.local.set({ companies: updated }, () => {
        alert(`${name} saved!`);
        document.getElementById("companyName").value = "";
        document.getElementById("companyUrl").value = "";
        document.getElementById("className").value = "";
        companyForm.classList.remove("active");
      });
    });
  });

  function renderJobs(jobData, appliedJobs) {
    output.innerHTML = "";
    jobData.forEach(({ company, jobs }) => {
      const companyTitle = document.createElement("h2");
      companyTitle.textContent = company;

      const removeBtn = document.createElement("button");
      removeBtn.textContent = "-";
      removeBtn.classList.add("remove-company");

      removeBtn.addEventListener("click", () => {
        chrome.storage.local.get({ companies: [], jobData: [] }, (result) => {
          const updatedCompanies = result.companies.filter(c => c.name !== company);
          const updatedJobData = result.jobData.filter(data => data.company !== company);

          chrome.storage.local.set({ companies: updatedCompanies, jobData: updatedJobData }, () => {
            alert(`${company} removed!`);
            renderJobs(updatedJobData, appliedJobs);
          });
        });
      });

      const companyContainer = document.createElement("div");
      companyContainer.classList.add("company-container");
      companyContainer.appendChild(companyTitle);
      companyContainer.appendChild(removeBtn);
      output.appendChild(companyContainer);

      const ul = document.createElement("ul");
      jobs.forEach(job => {
        const li = document.createElement("li");
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = appliedJobs.includes(job);

        checkbox.addEventListener("change", () => {
          chrome.storage.local.get({ appliedJobs: [] }, (res) => {
            let updated = [...res.appliedJobs];
            if (checkbox.checked) {
              if (!updated.includes(job)) updated.push(job);
            } else {
              updated = updated.filter(j => j !== job);
            }
            chrome.storage.local.set({ appliedJobs: updated });
          });
        });

        const label = document.createElement("label");
        label.textContent = job;

        li.appendChild(checkbox);
        li.appendChild(label);
        ul.appendChild(li);
      });
      output.appendChild(ul);
    });
  }

  chrome.storage.local.get({ jobData: [], appliedJobs: [] }, ({ jobData, appliedJobs }) => {
    if (Array.isArray(jobData)) {
      renderJobs(jobData, appliedJobs);
    }
  });

  function showToast(msg, isSuccess) {
    const toast = document.createElement("div");
    toast.textContent = msg;
    toast.style.position = "fixed";
    toast.style.bottom = "80px";
    toast.style.right = "20px";
    toast.style.padding = "10px 20px";
    toast.style.backgroundColor = isSuccess ? "#34a853" : "#ea4335";
    toast.style.color = "white";
    toast.style.borderRadius = "8px";
    toast.style.boxShadow = "0 2px 6px rgba(0,0,0,0.3)";
    toast.style.zIndex = "9999";
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2500);
  }

  async function scrapeFromTab(tabId, className) {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: (className) => {
        const elements = document.querySelectorAll(`.${className}`);
        return Array.from(elements).map(el => el.textContent.trim()).filter(Boolean);
      },
      args: [className],
    });
    return result;
  }

  checkBtn.addEventListener("click", async () => {
    // Show loader
    const loader = document.createElement("div");
    loader.className = "loader-container";
    loader.innerHTML = `<div class="loader"></div>`;
    output.innerHTML = "";
    output.appendChild(loader);
  
    chrome.storage.local.get({ companies: [], appliedJobs: [], jobData: [] }, async ({ companies, appliedJobs, jobData }) => {
      const newJobData = [];
      let foundNew = false;
  
      for (const { name, url, className } of companies) {
        try {
          const [tab] = await chrome.tabs.query({ url });
          let tabId;
  
          if (tab) {
            tabId = tab.id;
          } else {
            const newTab = await chrome.tabs.create({ url, active: false });
            tabId = newTab.id;
            await new Promise(resolve => setTimeout(resolve, 2500));
          }
  
          const jobs = await scrapeFromTab(tabId, className);
          const prevCompanyData = jobData.find(entry => entry.company === name);
          const prevJobs = prevCompanyData ? prevCompanyData.jobs : [];
          const newJobs = jobs.filter(job => !prevJobs.includes(job));
  
          if (newJobs.length > 0) {
            foundNew = true;
          }
  
          newJobData.push({ company: name, jobs });
          chrome.tabs.remove(tabId);
        } catch (error) {
          console.error(`Error checking jobs for ${name}:`, error);
          const errorMsg = document.createElement("p");
          errorMsg.textContent = `Could not fetch jobs for ${name}`;
          output.appendChild(errorMsg);
        }
      }
  
      // Remove loader
      output.innerHTML = "";
  
      chrome.storage.local.set({ jobData: newJobData }, () => {
        renderJobs(newJobData, appliedJobs);
      });
  
      resultDiv.textContent = "";
      card.classList.add("flash-success");
      setTimeout(() => card.classList.remove("flash-success"), 1000);
      showToast(foundNew ? "🎉 New jobs found!" : "📭 No new jobs.", foundNew);
    });
  });  
});
