// analyzer.js

function analyzeDocument(file, annee) {
    const resultZone = document.getElementById(`resultat-${annee.id}`);
    if (!resultZone) {
        console.error(`Result zone for year ${annee.id} not found.`);
        return;
    }

    resultZone.classList.add('visible');
    resultZone.innerHTML = `
        <div class="analyse-en-cours">
            <div class="spinner" aria-hidden="true"></div>
            <span>Analyse de votre document en cours (cela peut prendre un moment)...</span>
        </div>`;

    const analysisPromise = Tesseract.recognize(
        file,
        'fra', // French language
        {
            logger: m => {
                console.log(m);
                if (m.status === 'recognizing text') {
                    const progress = Math.round(m.progress * 100);
                    resultZone.innerHTML = `
                        <div class="analyse-en-cours">
                            <div class="spinner" aria-hidden="true"></div>
                            <span>Analyse : ${progress}%</span>
                        </div>`;
                }
            }
        }
    );

    const minTimePromise = new Promise(resolve => setTimeout(resolve, 2000));

    Promise.all([analysisPromise, minTimePromise])
        .then(([{ data: { text } }]) => {
            console.log("OCR Text:", text);
            const results = parseOcrText(text, annee);
            displayResults(results, annee, file);
        })
        .catch(err => {
            console.error("Analysis Error:", err);
            let errorMessage;
            const errStr = (err instanceof Error) ? err.message : (typeof err === 'string' ? err : JSON.stringify(err));

            if (errStr.includes("Error attempting to read image")) {
                errorMessage = "Nous ne parvenons malheureusement pas à décrypter ce document, auriez-vous un autre document à disposition ?";
            } else {
                errorMessage = `Détail de l'erreur : ${errStr}`;
            }
            
            // Ensure the error is displayed after the minimum time as well
            setTimeout(() => {
                resultZone.innerHTML = `
                    <div class="resultat-ko">
                        <h4>L'analyse a échoué.</h4>
                        <p>${errorMessage}</p>
                        <button class="btn-primaire" onclick="triggerFileUpload(${annee.id})">Réessayer</button>
                    </div>`;
            }, 2000);
        });
}

function parseOcrText(text, annee) {
    const results = {
        year: null,
        activityPeriod: null,
        employeeName: null,
        employerName: null,
        socialSecurityNumber: null,
        birthdate: null,
        salary: null,
        foundYear: false
    };

    // 1. Year and activity period
    const yearRegex = new RegExp(`\\b(${annee.id})\\b`);
    if (yearRegex.test(text)) {
        results.year = annee.id;
        results.foundYear = true;
    }
    
    // Simple regex, to be improved.
    const periodRegex = /(période du|du au) ([\d\/]+) (au|au) ([\d\/]+)/i;
    const periodMatch = text.match(periodRegex);
    if (periodMatch) {
        results.activityPeriod = periodMatch[0];
    } else if (results.year) {
        results.activityPeriod = `Année ${results.year}`;
    }

    // 2. Employee / Employer name
    // These are very document-specific and hard to get right without more context.
    // Using keywords that might appear before the names.
    let nameMatch = text.match(/(?:nom|prénom|salarié|employé)\s*:\s*([A-Z\s]+)/i);
    if (nameMatch) {
        results.employeeName = nameMatch[1].trim();
    }

    let employerMatch = text.match(/(?:employeur|entreprise)\s*:\s*([A-Z\s]+)/i);
    if (employerMatch) {
        results.employerName = employerMatch[1].trim();
    }

    // 3. Social security number or birthdate
    const ssnRegex = /\b[12]\s\d{2}\s\d{2}\s\d{2}\s\d{3}\s\d{3}\s\d{2}\b/g;
    const ssnMatch = text.match(ssnRegex);
    if (ssnMatch) {
        results.socialSecurityNumber = ssnMatch[0];
    }

    const birthdateRegex = /(né\(e\) le|date de naissance)\s*:?\s*(\d{2}\/\d{2}\/\d{4})/i;
    const birthdateMatch = text.match(birthdateRegex);
    if (birthdateMatch) {
        results.birthdate = birthdateMatch[2];
    }

    // 4. Salary
    // Looking for "Net à payer" or "Salaire brut"
    const salaryRegex = /(net à payer|salaire brut|total brut)\s*([0-9\s,.]+)€?/i;
    const salaryMatch = text.match(salaryRegex);
    if (salaryMatch) {
        results.salary = salaryMatch[2].trim();
    }

    return results;
}

function displayResults(results, annee, file) {
    const resultZone = document.getElementById(`resultat-${annee.id}`);
    const fileIsCorrect = results.foundYear; // Simple check for now

    if (fileIsCorrect) {
        const fichier = {
            libelle: `Document pour ${annee.id}`,
            message: `Analyse terminée.`
        };

        let detailsHtml = `
            <p><strong>Année :</strong> ${results.year || 'Non trouvé'}</p>
            <p><strong>Période d'activité :</strong> ${results.activityPeriod || 'Non trouvée'}</p>
            <p><strong>Employé :</strong> ${results.employeeName || 'Non trouvé'}</p>
            <p><strong>Employeur :</strong> ${results.employerName || 'Non trouvé'}</p>
            <p><strong>N° Sécurité Sociale :</strong> ${results.socialSecurityNumber || 'Non trouvé'}</p>
            <p><strong>Date de naissance :</strong> ${results.birthdate || 'Non trouvé'}</p>
            <p><strong>Salaire (brut/net) :</strong> ${results.salary || 'Non trouvé'}</p>
        `;

        resultZone.innerHTML = `
            <div class="resultat-ok">
              <div class="detail">
                <strong>${fichier.libelle}</strong>
                <p>${fichier.message}</p>
                <div class="note-reformat">${detailsHtml}</div>
              </div>
              <div class="tampon anim">Vérifié</div>
            </div>`;

        const carte = document.getElementById('carte-' + annee.id);
        carte.classList.add('validee');
        document.getElementById('actions-' + annee.id).style.display = 'none';
        etatValidation[annee.id] = true;
        mettreAJourProgression();

    } else {
        const fichier = {
             message: `Le document que vous avez envoyé ne semble pas correspondre à l'année ${annee.id}. Veuillez vérifier votre document ou en choisir un autre.`
        };
        afficherRefus(annee, fichier);
    }
}

function triggerFileUpload(id) {
    anneeCourante = ANNEES.find(a => a.id === id);
    const fileInput = document.getElementById('file-upload-' + id);
    if (fileInput) {
        fileInput.click();
    } else {
        console.error('File input not found for year ' + id);
    }
}

// Setup file inputs
function setupFileInputs() {
    ANNEES.forEach(annee => {
        const container = document.getElementById('actions-' + annee.id);
        if (container) {
            const fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.id = `file-upload-${annee.id}`;
            fileInput.style.display = 'none';
            fileInput.accept = 'image/*,application/pdf';
            fileInput.addEventListener('change', (event) => {
                const file = event.target.files[0];
                if (file) {
                    analyzeDocument(file, annee);
                }
            });
            container.appendChild(fileInput);
        }
    });
}
