document.addEventListener('DOMContentLoaded', () => {
  const toggleBtn = document.getElementById("toggleAddCompany");
  const companyForm = document.getElementById("companyInputs");
  const saveBtn = document.getElementById("saveCompany");
  const output = document.getElementById("jobList");
  const checkBtn = document.getElementById("checkBtn");
  const buttonContainer = document.getElementById("buttonContainer");
  const resultDiv = document.getElementById("result");
  const card = document.querySelector(".card");

  function populateCompanyDropdown(companies) {
    const dropdown = document.getElementById("companyDropdown");
    dropdown.innerHTML = '<option value="">-- Choose a company --</option>';
    companies.sort((a, b) => a.name.localeCompare(b.name));

    companies.forEach(company => {
      const option = document.createElement("option");
      option.value = company.name;
      option.textContent = company.name;
      dropdown.appendChild(option);
    });
  }

  fetch(chrome.runtime.getURL('companies.csv'))
    .then(response => response.text())
    .then(csv => {
      const rows = csv.trim().split('\n').slice(1);
      const knownCompanies = rows.map(row => {
        const [name, link, className] = row.split(',');
        return { name: name.trim(), link: link.trim(), className: className.trim() };
      });

      populateCompanyDropdown(knownCompanies);

      const dropdown = document.getElementById('companyDropdown');
      dropdown.addEventListener('change', () => {
        const value = dropdown.value;
        if (value) {
          const selected = knownCompanies.find(c => c.name === value);
          if (selected) {
            document.getElementById("companyName").value = selected.name;
            document.getElementById("companyUrl").value = selected.link;
            document.getElementById("className").value = selected.className;
          }
        } else {
          document.getElementById("companyName").value = '';
          document.getElementById("companyUrl").value = '';
          document.getElementById("className").value = '';
        }
      });
    });

  let filterKeywords = [];

  chrome.storage.sync.get(['filterKeywords'], (result) => {
    if (result.filterKeywords) {
      filterKeywords = result.filterKeywords;
      document.getElementById("filterKeywords").value = filterKeywords.join(', ');
    }
  });

  document.getElementById("saveFilter").addEventListener("click", () => {
    const keywords = document.getElementById("filterKeywords").value
      .split(',')
      .map(k => k.trim().toLowerCase())
      .filter(k => k.length > 0);

    chrome.storage.sync.set({ filterKeywords: keywords }, () => {
      filterKeywords = keywords;

      chrome.storage.local.get({ jobData: [], appliedJobs: [] }, ({ jobData, appliedJobs }) => {
        let reappeared = false;

        jobData.forEach(({ company, jobs }) => {
          const newlyVisibleJobs = jobs.filter(job => {
            return !keywords.some(k => job.toLowerCase().includes(k));
          });

          const previouslyHiddenJobs = jobs.filter(job => !jobTitleIsAllowed(job));
          const newlyUnhiddenJobs = newlyVisibleJobs.filter(job => previouslyHiddenJobs.includes(job));

          if (newlyUnhiddenJobs.length > 0) reappeared = true;
        });

        renderJobs(jobData, appliedJobs, jobData);
        if (reappeared) {
          resultDiv.textContent = "";
          card.classList.add("flash-success");
          setTimeout(() => card.classList.remove("flash-success"), 1000);
          showToast("🎉 Some jobs are visible again!", true);
        }
      });

      alert("Filter saved!");
      document.getElementById("filterInputContainer").style.display = "none";
    });
  });

  document.getElementById("filterBtn").addEventListener("click", () => {
    const container = document.getElementById("filterInputContainer");
    container.style.display = container.style.display === 'none' ? 'block' : 'none';
  });

  function jobTitleIsAllowed(title) {
    return !filterKeywords.some(keyword => title.toLowerCase().includes(keyword));
  }

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

  function renderJobs(jobData, appliedJobs, previousJobData = []) {
    output.innerHTML = "";
    jobData.forEach(({ company, jobs, url }) => {
      const companyTitle = document.createElement("h2");
      companyTitle.textContent = company;
  
      // Create the "remove company" button
      const removeBtn = document.createElement("button");
      removeBtn.classList.add("remove-company");
      const trashIcon = document.createElement('i');
      trashIcon.classList.add('fas', 'fa-trash');
      removeBtn.appendChild(trashIcon);
  
      const visitBtn = document.createElement("button");
      visitBtn.classList.add("visit-company");
      const linkIcon = document.createElement('i');
      linkIcon.classList.add('fas', 'fa-external-link-alt');
      visitBtn.appendChild(linkIcon);
      visitBtn.addEventListener("click", () => {
      
        if (url && url.startsWith("http")) {
          window.open(url, "_blank");
        } else {
          alert("Invalid URL. Please check the company's URL." + url);
        }
      });      
  
      removeBtn.addEventListener("click", () => {
        chrome.storage.local.get({ companies: [], jobData: [] }, (result) => {
          const updatedCompanies = result.companies.filter(c => c.name !== company);
          const updatedJobData = result.jobData.filter(data => data.company !== company);
      
          chrome.storage.local.set({ companies: updatedCompanies, jobData: updatedJobData }, () => {
            alert(`${company} removed!`)
            renderJobs(updatedJobData, appliedJobs, updatedJobData);
          });
        });
      });      

      const companyContainer = document.createElement("div");
      const companyButtonContainer = document.createElement("div");
      companyContainer.classList.add("company-container");
      companyContainer.appendChild(companyTitle);
      companyButtonContainer.classList.add("company-button-container");
      companyContainer.appendChild(companyButtonContainer);
      companyButtonContainer.appendChild(visitBtn); 
      companyButtonContainer.appendChild(removeBtn);
      output.appendChild(companyContainer);
  
      const ul = document.createElement("ul");
  
      const previousJobs = previousJobData.find(d => d.company === company)?.jobs || [];
  
      jobs.forEach(job => {
        if (jobTitleIsAllowed(job)) {
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
  
          if (!previousJobs.includes(job)) {
            label.classList.add("new-job");
          }
  
          const jobTitleContainer = document.createElement("div");
          jobTitleContainer.classList.add("job-title-container");
          jobTitleContainer.appendChild(label);
  
          li.appendChild(checkbox);
          li.appendChild(jobTitleContainer);
          ul.appendChild(li);
        }
      });
      output.appendChild(ul);
    });
  }  

  chrome.storage.local.get({ jobData: [], appliedJobs: [] }, ({ jobData, appliedJobs }) => {
    if (Array.isArray(jobData)) {
      renderJobs(jobData, appliedJobs, jobData);
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
      func: async (className) => {
        function waitForElements(selector, timeout = 10000) {
          return new Promise((resolve, reject) => {
            const start = Date.now();
            const check = () => {
              const elements = document.querySelectorAll(selector);
              if (elements.length > 0) {
                resolve(Array.from(elements).map(el => el.textContent.trim()).filter(Boolean));
              } else if (Date.now() - start > timeout) {
                reject(new Error("Timeout waiting for elements"));
              } else {
                setTimeout(check, 300);
              }
            };
            check();
          });
        }

        try {
          const selector = className.split(' ').map(cls => `.${cls}`).join('');
          return await waitForElements(selector);
        } catch {
          return [];
        }
      },
      args: [className],
    });
    return result;
  }

  checkBtn.addEventListener("click", async () => {
    const loader = document.createElement("div");
    loader.className = "loader-container";
    loader.innerHTML = `<div class="loader"></div>`;
    output.innerHTML = "";
    output.appendChild(loader);

    chrome.storage.local.get({ companies: [], appliedJobs: [], jobData: [] }, async ({ companies, appliedJobs, jobData }) => {
      const newJobData = [];
      let foundNew = false;

      const scrapeJobsForCompany = async ({ name, url, className }) => {
        let tabId;
        let openedNewTab = false;

        try {
          const [existingTab] = await chrome.tabs.query({ url });

          if (existingTab) {
            tabId = existingTab.id;
          } else {
            const newTab = await chrome.tabs.create({ url, active: false });
            tabId = newTab.id;
            openedNewTab = true;

            await new Promise(resolve => {
              const checkTabLoaded = () => {
                chrome.tabs.get(tabId, (tab) => {
                  if (tab && tab.status === "complete") {
                    resolve();
                  } else {
                    setTimeout(checkTabLoaded, 2000);
                  }
                });
              };
              checkTabLoaded();
            });
          }

          const jobs = await scrapeFromTab(tabId, className);
          const prevCompanyData = jobData.find(entry => entry.company === name);
          const prevJobs = prevCompanyData ? prevCompanyData.jobs : [];
          const newJobs = jobs.filter(job => !prevJobs.includes(job));

          if (newJobs.some(jobTitleIsAllowed)) foundNew = true;
          newJobData.push({ company: name, jobs, url });

          if (openedNewTab) await chrome.tabs.remove(tabId);
        } catch (err) {
          console.error(`Failed scraping ${name}:`, err);
          newJobData.push({ company: name, jobs: [] });
        }
      };

      await Promise.all(companies.map(scrapeJobsForCompany));

      output.innerHTML = "";
      chrome.storage.local.set({ jobData: newJobData }, () => {
        renderJobs(newJobData, appliedJobs, jobData);
      });

      resultDiv.textContent = "";
      card.classList.add("flash-success");
      setTimeout(() => card.classList.remove("flash-success"), 1000);
      showToast(foundNew ? "🎉 New jobs found!" : "📭 No new jobs.", foundNew);

      const now = new Date();
      const formatted = now.toLocaleString("en-US", { hour: 'numeric', minute: 'numeric', hour12: true, day: 'numeric', month: 'long', year: 'numeric' });
      chrome.storage.local.set({ lastUpdated: formatted }, () => {
        const lastUpdatedElem = document.getElementById("lastUpdated");
        if (lastUpdatedElem) {
          lastUpdatedElem.textContent = "Last updated: " + formatted;
        }
      });
    });
  });

  chrome.storage.local.get(["lastUpdated"], (result) => {
    const lastUpdatedElem = document.getElementById("lastUpdated");
    if (result.lastUpdated && lastUpdatedElem) {
      lastUpdatedElem.textContent = "Last updated: " + result.lastUpdated;
    }
  });

  const versionElem = document.getElementById("version");
  if (versionElem) {
    const manifest = chrome.runtime.getManifest();
    versionElem.textContent = "v"+manifest.version;
  }
});
