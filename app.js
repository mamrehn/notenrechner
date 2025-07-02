// app.js
$(function() {
    // Get the base URL for examples
    const baseUrl = window.location.href.split('?')[0];

    // Update example links with the actual base URL
    $('#example-1').attr('href', baseUrl + '?max=13&p=11').text(baseUrl + '?max=13&p=11');
    $('#example-2').attr('href', baseUrl + '?max=100&p=85').text(baseUrl + '?max=100&p=85');

    // Backbone Model for a single grade entry
    const Grade = Backbone.Model.extend({
        defaults: {
            grade: '',      // e.g., "Sehr gut"
            minPoints: 0,   // Minimum points for this grade
            maxPoints: 100, // Maximum points for this grade
        }
    });

    // Backbone Collection for all grades
    const Grades = Backbone.Collection.extend({
        model: Grade
    });

    // Backbone View for a single grade row in the table
    const GradeView = Backbone.View.extend({
        tagName: 'tr', // Each grade will be rendered as a table row
        // Template to display min/max points and the grade
        template: _.template('<td><%= minPoints.toFixed(2) %> - <%= maxPoints.toFixed(2) %></td><td><%= grade %></td>'),
        render: function() {
            // Render the model data into the template and set it as the element's HTML
            this.$el.html(this.template(this.model.toJSON()));
            return this;
        }
    });

    // Backbone View for the entire grading scale table
    const GradesView = Backbone.View.extend({
        el: '#grading-scale',
        initialize: function() {
            // Use window.location.search for query parameters
            const params = new URLSearchParams(window.location.search);
            const maxPoints = parseFloat(params.get('max')) || 100;
            const smaxPoints = parseFloat(params.get('smax')) || maxPoints;

            const extraPoints = smaxPoints - maxPoints;
            const calcMaxPoints = maxPoints + extraPoints;
            
            const gradeLabels = [
                "Sehr gut",    // 1
                "Gut",         // 2
                "Befriedigend",// 3
                "Ausreichend", // 4
                "Mangelhaft",  // 5
                "Ungenügend"   // 6
            ]

            this.collection = new Grades([
                { grade: gradeLabels[0], minPoints: Math.round(2 * 92 / 100 * calcMaxPoints) / 2 - 0.25, maxPoints: maxPoints },
                { grade: gradeLabels[1], minPoints: Math.round(2 * 81 / 100 * calcMaxPoints) / 2 - 0.25, maxPoints: Math.round(2 * 92 / 100 * calcMaxPoints) / 2 - 0.26 },
                { grade: gradeLabels[2], minPoints: Math.round(2 * 67 / 100 * calcMaxPoints) / 2 - 0.25, maxPoints: Math.round(2 * 81 / 100 * calcMaxPoints) / 2 - 0.26 },
                { grade: gradeLabels[3], minPoints: Math.round(2 * 50 / 100 * calcMaxPoints) / 2 - 0.25, maxPoints: Math.round(2 * 67 / 100 * calcMaxPoints) / 2 - 0.26 },
                { grade: gradeLabels[4], minPoints: Math.round(2 * 30 / 100 * calcMaxPoints) / 2 - 0.25, maxPoints: Math.round(2 * 50 / 100 * calcMaxPoints) / 2 - 0.26 },
                { grade: gradeLabels[5], minPoints: 0, maxPoints: Math.round(2 * 30 / 100 * calcMaxPoints) / 2 - 0.26 }
            ]);

            this.render();
            this.highlightRow();
            this.checkAndShowUsage(); // Check if usage box should be shown
        },
        render: function() {
            // Clear existing table rows
            this.$el.empty();
            const self = this;
            // Iterate over each grade model in the collection and render its view
            this.collection.each(function(grade) {
                const gradeView = new GradeView({ model: grade });
                self.$el.append(gradeView.render().el); // Append the rendered row to the table body
            });
        },
        highlightRow: function() {
            // Use window.location.search for query parameters
            const params = new URLSearchParams(window.location.search);
            const points = parseFloat(params.get('p')); // Get the achieved points from URL

            // If no points are provided or it's not a number, do nothing
            if (isNaN(points)) {
                return;
            }

            // Find the grade model that corresponds to the achieved points
            const grade = this.collection.find(function(model) {
                // Check if points fall within the grade's range
                return points >= model.get('minPoints') && points <= model.get('maxPoints');
            });

            // If a matching grade is found, highlight its row and display the result
            if (grade) {
                // Find the corresponding table row element
                const gradeElement = this.$el.find('tr').eq(this.collection.indexOf(grade));
                // Add Bootstrap class for highlighting
                gradeElement.addClass('table-info');

                // Determine the numerical grade (1-6)
                const gradeLabels = [
                    "Sehr gut", "Gut", "Befriedigend",
                    "Ausreichend", "Mangelhaft", "Ungenügend"
                ];
                const numericalGrade = gradeLabels.indexOf(grade.get('grade')) + 1;

                // Display the result in the dedicated div
                $('#result').html(
                    `Erreichte Note: ${numericalGrade} (${grade.get('grade').toLowerCase()}) mit ${points.toFixed(2)} Punkten.`
                ).addClass('alert-info').show(); // Show the result box with Bootstrap alert styling
            }
        },
        // New function to check and show usage box
        checkAndShowUsage: function() {
            // Use window.location.search for query parameters
            const params = new URLSearchParams(window.location.search);
            // If no 'max' or 'p' parameters are present, show the usage box
            if (!params.has('max') && !params.has('p')) {
                $('#usage-box').show(); // Show the usage box
            }
        }
    });

    // Initialize the main view, which sets up the application
    let gradesViewInstance = new GradesView();

    // Add event listener for popstate (when browser history changes, e.g., back/forward buttons)
    window.addEventListener("popstate", function () {
        // Re-initialize the GradesView to re-compute and re-render based on the new URL
        gradesViewInstance = new GradesView();
    });
});
